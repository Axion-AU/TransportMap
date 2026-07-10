use std::error::Error;
use std::fs;
use std::io::{self, Cursor, Read};
use std::path::Path;
use zip::ZipArchive;

/// Downloads the latest GTFS data from the Transport Victoria portal if the local file does not exist,
/// or is older than 7 days.
pub fn download_gtfs_if_needed(zip_path: &Path) -> Result<(), Box<dyn Error>> {
    let mut needs_download = true;

    if zip_path.exists() {
        if let Ok(metadata) = fs::metadata(zip_path) {
            if let Ok(modified) = metadata.modified() {
                if let Ok(elapsed) = modified.elapsed() {
                    let seven_days = 7 * 24 * 60 * 60;
                    if elapsed.as_secs() < seven_days {
                        println!("Cached GTFS zip file is up to date (less than 7 days old). Skipping download.");
                        needs_download = false;
                    } else {
                        println!("Cached GTFS zip file is older than 7 days. Initiating download...");
                    }
                }
            }
        }
    }

    if needs_download {
        println!("Downloading latest GTFS data from Transport Victoria...");
        let url = "https://opendata.transport.vic.gov.au/dataset/3f4e292e-7f8a-4ffe-831f-1953be0fe448/resource/fb152201-859f-4882-9206-b768060b50ad/download/gtfs.zip";
        
        if let Some(parent) = zip_path.parent() {
            fs::create_dir_all(parent)?;
        }

        let status = std::process::Command::new("curl")
            .arg("-L")
            .arg("-o")
            .arg(zip_path)
            .arg(url)
            .status()?;

        if !status.success() {
            return Err(format!("curl failed to download GTFS data with exit code: {:?}", status.code()).into());
        }

        println!("GTFS download completed successfully.");
    }

    Ok(())
}

/// Helper function to extract a GTFS zip archive into the output directory.
///
/// It supports two structures:
/// 1. Nested mode zip structure: The main zip contains files/directories with nested zip files
///    (e.g., `1/google_transit.zip` or `1.zip`). These are extracted to `<output_dir>/<mode>/google_transit/`.
/// 2. Flat structure: The main zip directly contains GTFS text files (e.g. `routes.txt`, `stops.txt`).
///    These are extracted directly to the `<output_dir>/` directory.
pub fn extract_gtfs_zip(zip_path: &Path, output_dir: &Path) -> Result<(), Box<dyn Error>> {
    let zip_file = fs::File::open(zip_path)?;
    let mut archive = ZipArchive::new(zip_file)?;

    // First pass: Detect if there are nested zip files
    let mut has_nested_zips = false;
    for i in 0..archive.len() {
        let entry = archive.by_index(i)?;
        if entry.is_file() && entry.name().ends_with(".zip") {
            has_nested_zips = true;
            break;
        }
    }

    if has_nested_zips {
        println!("Detected nested zip structure in GTFS archive. Extracting modes...");
        for i in 0..archive.len() {
            let mut entry = archive.by_index(i)?;
            if !entry.is_file() {
                continue;
            }

            let entry_name = entry.name().to_string();
            if !entry_name.ends_with(".zip") {
                continue;
            }

            // Extract the mode name from the path.
            // e.g. "1/google_transit.zip" -> "1"
            // e.g. "1.zip" -> "1"
            let entry_path = Path::new(&entry_name);
            let mode_dir = if entry_name.ends_with("google_transit.zip") {
                entry_path.parent()
                    .and_then(|p| p.file_name())
                    .map(|n| n.to_string_lossy().into_owned())
            } else {
                entry_path.file_stem()
                    .map(|n| n.to_string_lossy().into_owned())
            };

            if let Some(mode) = mode_dir {
                let target_dir = output_dir.join(&mode).join("google_transit");
                println!("Extracting nested mode zip '{}' to {:?}", entry_name, target_dir);
                fs::create_dir_all(&target_dir)?;

                // Read nested zip into memory to avoid extracting it to disk first
                let mut buffer = Vec::new();
                io::copy(&mut entry, &mut buffer)?;
                
                let mut nested_archive = ZipArchive::new(Cursor::new(buffer))?;
                extract_archive_contents(&mut nested_archive, &target_dir)?;
            }
        }
    } else {
        println!("Detected flat GTFS zip structure. Extracting directly to {:?}", output_dir);
        fs::create_dir_all(output_dir)?;
        extract_archive_contents(&mut archive, output_dir)?;
    }

    Ok(())
}

fn extract_archive_contents<R: Read + io::Seek>(
    archive: &mut ZipArchive<R>,
    target_dir: &Path,
) -> Result<(), Box<dyn Error>> {
    for i in 0..archive.len() {
        let mut file = archive.by_index(i)?;
        let outpath = match file.enclosed_name() {
            Some(path) => target_dir.join(path),
            None => continue,
        };

        if file.name().ends_with('/') {
            fs::create_dir_all(&outpath)?;
        } else {
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    fs::create_dir_all(p)?;
                }
            }
            let mut outfile = fs::File::create(&outpath)?;
            io::copy(&mut file, &mut outfile)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::write::FileOptions;

    #[test]
    fn test_extract_flat_zip() -> Result<(), Box<dyn Error>> {
        let temp_dir = tempfile::tempdir()?;
        let zip_path = temp_dir.path().join("flat.zip");
        let output_dir = temp_dir.path().join("extracted");

        // Create a flat zip file
        {
            let file = fs::File::create(&zip_path)?;
            let mut zip = zip::ZipWriter::new(file);
            zip.start_file("routes.txt", FileOptions::default())?;
            zip.write_all(b"route_id,route_short_name\n1,Tram")?;
            zip.finish()?;
        }

        extract_gtfs_zip(&zip_path, &output_dir)?;

        let extracted_file = output_dir.join("routes.txt");
        assert!(extracted_file.exists());
        let content = fs::read_to_string(extracted_file)?;
        assert_eq!(content, "route_id,route_short_name\n1,Tram");

        Ok(())
    }

    #[test]
    fn test_extract_nested_zip() -> Result<(), Box<dyn Error>> {
        let temp_dir = tempfile::tempdir()?;
        let zip_path = temp_dir.path().join("nested.zip");
        let output_dir = temp_dir.path().join("extracted");

        // Create a mock nested zip file (with a mode directory and a google_transit.zip inside)
        {
            let file = fs::File::create(&zip_path)?;
            let mut zip = zip::ZipWriter::new(file);

            // Create inner zip content in-memory
            let mut inner_zip_buf = Vec::new();
            {
                let mut inner_zip = zip::ZipWriter::new(Cursor::new(&mut inner_zip_buf));
                inner_zip.start_file("stops.txt", FileOptions::default())?;
                inner_zip.write_all(b"stop_id,stop_name\n101,Melbourne")?;
                inner_zip.finish()?;
            }

            // Write inner zip into the outer zip
            zip.start_file("2/google_transit.zip", FileOptions::default())?;
            zip.write_all(&inner_zip_buf)?;
            zip.finish()?;
        }

        extract_gtfs_zip(&zip_path, &output_dir)?;

        let extracted_file = output_dir.join("2/google_transit/stops.txt");
        assert!(extracted_file.exists());
        let content = fs::read_to_string(extracted_file)?;
        assert_eq!(content, "stop_id,stop_name\n101,Melbourne");

        Ok(())
    }

    #[test]
    fn test_download_gtfs_if_needed_cached() -> Result<(), Box<dyn Error>> {
        let temp_dir = tempfile::tempdir()?;
        let zip_path = temp_dir.path().join("gtfs.zip");
        
        // Create a dummy file to act as the cache
        fs::write(&zip_path, b"dummy data")?;

        // This call should detect that the file exists and is less than 7 days old,
        // so it will skip the curl download and return successfully.
        download_gtfs_if_needed(&zip_path)?;

        // Ensure the dummy data was not overwritten
        let content = fs::read_to_string(&zip_path)?;
        assert_eq!(content, "dummy data");

        Ok(())
    }
}
