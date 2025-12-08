import init, { calculate_connectivity_score, calculate_parking_score, calculate_walk_score } from 'transport_inequality';

export const initWasm = async () => {
    await init();
    return {
        calculate_connectivity_score,
        calculate_parking_score,
        calculate_walk_score
    };
};
