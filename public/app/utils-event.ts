export interface ClientCoordinates {
    clientX: number;
    clientY: number;
}

export const touchToCoordinates = (e: TouchEvent): ClientCoordinates => {
    const touch = e.touches.item(0);
    if (!touch) {
        return {
            clientX: 0,
            clientY: 0,
        };
    }

    return touch;
};
