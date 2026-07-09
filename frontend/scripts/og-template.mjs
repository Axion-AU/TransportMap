/**
 * Satori element tree for share images (1200x630).
 *
 * Hard compliance gate: the template throws unless the authorisation line
 * it receives exactly matches the one in src/config/site.ts. No image
 * renders without it. The generator also greps satori's SVG output for the
 * line before rasterising.
 */

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

const el = (type, style, children) => ({ type, props: { style, children } });

function ring(size, opacity) {
    return el('div', {
        position: 'absolute',
        top: (64 - size) / 2,
        left: (64 - size) / 2,
        width: size,
        height: size,
        borderRadius: '50%',
        border: '3px solid #FFFFFF',
        opacity,
    });
}

export function ogTemplate({ heading, score, scoreColor, verdict, authLine, expectedAuthLine, fixture, siteLabel }) {
    if (!authLine || authLine !== expectedAuthLine) {
        throw new Error('OG render blocked: authorisation line missing or does not match site config.');
    }

    const scoreText = score !== null && score !== undefined ? String(score) : '';

    return el('div', {
        width: OG_WIDTH,
        height: OG_HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#1A0029',
        color: '#FFFFFF',
        fontFamily: 'Barlow',
        position: 'relative',
    }, [
        // Header: rings mark + wordmark
        el('div', { display: 'flex', alignItems: 'center', gap: 18, padding: '40px 56px 0 56px' }, [
            el('div', { position: 'relative', width: 64, height: 64, display: 'flex' }, [
                ring(64, 0.95), ring(48, 0.8), ring(32, 0.65), ring(16, 0.5),
            ]),
            el('div', {
                fontFamily: 'Barlow Condensed',
                fontWeight: 900,
                fontSize: 40,
                letterSpacing: '-0.02em',
                textTransform: 'uppercase',
                display: 'flex',
            }, 'FUSION TRANSPORT SCORE'),
        ]),

        // Body: score numeral + suburb + verdict
        el('div', { display: 'flex', flexDirection: 'column', flexGrow: 1, padding: '12px 56px 0 56px', justifyContent: 'center' }, [
            el('div', { display: 'flex', alignItems: 'flex-end', gap: 20 }, [
                el('div', {
                    fontFamily: 'Space Mono',
                    fontWeight: 700,
                    fontSize: 190,
                    lineHeight: 0.9,
                    color: scoreColor,
                    display: 'flex',
                }, scoreText),
                el('div', {
                    fontFamily: 'Space Mono',
                    fontWeight: 700,
                    fontSize: 56,
                    color: 'rgba(255,255,255,0.45)',
                    paddingBottom: 14,
                    display: 'flex',
                }, '/100'),
            ]),
            el('div', {
                fontFamily: 'Barlow Condensed',
                fontWeight: 900,
                fontSize: 84,
                lineHeight: 0.92,
                letterSpacing: '-0.02em',
                textTransform: 'uppercase',
                marginTop: 10,
                display: 'flex',
            }, heading),
            el('div', {
                fontSize: 34,
                lineHeight: 1.3,
                color: 'rgba(255,255,255,0.85)',
                marginTop: 18,
                maxWidth: 1040,
                display: 'flex',
            }, verdict),
        ]),

        // Compliance strip: authorisation line is part of the pixels.
        el('div', {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '18px 56px',
            borderTop: '1px solid rgba(255,255,255,0.2)',
            backgroundColor: '#2E004D',
            fontSize: 24,
        }, [
            el('div', { display: 'flex', color: 'rgba(255,255,255,0.9)', fontWeight: 600 }, authLine),
            el('div', { display: 'flex', color: 'rgba(255,255,255,0.55)' }, siteLabel),
        ]),

        // Fixture watermark
        ...(fixture ? [el('div', {
            position: 'absolute',
            top: 250,
            left: 150,
            transform: 'rotate(-18deg)',
            fontFamily: 'Barlow Condensed',
            fontWeight: 900,
            fontSize: 120,
            color: 'rgba(255,255,255,0.14)',
            textTransform: 'uppercase',
            display: 'flex',
        }, 'SAMPLE DATA')] : []),
    ]);
}
