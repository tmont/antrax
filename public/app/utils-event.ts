export interface ClientCoordinates {
    clientX: number;
    clientY: number;
}

export const touchToCoordinates = (e: TouchEvent): ClientCoordinates => e.touches.item(0) || { clientX: 0, clientY: 0 };

export const isLeftMouseButton = (e: MouseEvent): boolean => e.button === 0;
