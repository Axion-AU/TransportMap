import { Link } from 'react-router-dom';

/**
 * "Why should I care, I like driving" answer -- placed on route pages
 * (and anywhere else the funnel needs it) because a route page is where a
 * driver-first reader is most likely to land and push back. Not a data
 * claim: no fixture, no citation gate. Editorial voice, one section, not
 * a detour into the full policy platform.
 */
const WhyPtMattersSection = () => (
    <section className="border border-border-subtle rounded-[4px] p-5 md:p-6 space-y-3 bg-surface-raised">
        <h2 className="type-display text-2xl text-ink">"I like driving, why should I care?"</h2>
        <div className="text-sm text-ink-soft leading-relaxed space-y-3">
            <p>
                Fair question. Nobody's taking your car. But not everyone drives, and everyone shares the
                road: every trip someone else makes by train, tram, or bus is a car that isn't in front of
                you at the lights. Fewer cars on the road means less traffic for the people still driving,
                not just the people who switched.
            </p>
            <p>
                There's no downside to investing in it. A frequent, reliable network costs money to run,
                but it pays that back in less congestion, cheaper freight, fewer crashes, and lower
                transport emissions, whether or not you personally ever board.
            </p>
            <p>
                Fusion's policy goes further: build the housing and commercial floor space directly next
                to the routes worth investing in, and let the public capture the land-value uplift that
                good transport creates, instead of handing it to whoever owned the land first. Invest in
                the route, invest in what's around it, and everyone wins, drivers included.
            </p>
            <p>
                <Link to="/the-plan" className="text-blue">See the plan</Link> for what that looks like route by route.
            </p>
        </div>
    </section>
);

export default WhyPtMattersSection;
