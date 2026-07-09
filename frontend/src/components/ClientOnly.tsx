import { useEffect, useState, type ReactNode } from 'react';

/**
 * Renders children only after mount. Keeps browser-only code (Leaflet)
 * out of the server render and makes hydration deterministic: the server
 * and the first client render both produce the fallback.
 */
const ClientOnly = ({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) => {
    const [mounted, setMounted] = useState(false);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the mounted flip after hydration is the entire point of this component
    useEffect(() => setMounted(true), []);
    return <>{mounted ? children : fallback}</>;
};

export default ClientOnly;
