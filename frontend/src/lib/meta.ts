/**
 * Client-side navigation metadata. Prerendered pages get their real tags
 * from scripts/prerender.mjs; this keeps the title honest after in-app
 * route changes.
 */

import { useEffect } from 'react';

export function usePageMeta(title: string, description?: string): void {
    useEffect(() => {
        document.title = title;
        if (description) {
            let tag = document.querySelector<HTMLMetaElement>('meta[name="description"]');
            if (!tag) {
                tag = document.createElement('meta');
                tag.name = 'description';
                document.head.appendChild(tag);
            }
            tag.content = description;
        }
    }, [title, description]);
}
