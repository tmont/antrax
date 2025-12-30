export interface ClientCoordinates {
    clientX: number;
    clientY: number;
}

export const touchToCoordinates = (e: TouchEvent): ClientCoordinates => {
    const touch = e.touches.item(0);
    return {
        clientX: touch?.clientX || 0,
        clientY: touch?.clientY || 0,
    };
};

export const isLeftMouseButton = (e: MouseEvent): boolean => e.button === 0;
