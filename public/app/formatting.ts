const relativeTimeFormatter = new Intl.RelativeTimeFormat([], {
    style: 'short',
    numeric: 'auto',
});

export const formatRelativeTime = (date: Date): string => {
    const diffMs = date.getTime() - Date.now();
    const absDiff = Math.abs(diffMs);
    let value: number;
    let unit: Intl.RelativeTimeFormatUnit;

    if (absDiff < 60 * 1000) {
        value = diffMs / 1000;
        unit = 'second';
    } else if (absDiff < 60 * 60 * 1000) {
        value = diffMs / 60 / 1000;
        unit = 'minute';
    } else if (absDiff < 24 * 60 * 60 * 1000) {
        value = diffMs / 60 / 60 / 1000;
        unit = 'hour';
    } else if (absDiff < 30 * 24 * 60 * 60 * 1000) {
        value = diffMs / 24 / 60 / 60 / 1000;
        unit = 'day';
    } else if (absDiff < 3 * 30 * 24 * 60 * 60 * 1000) {
        value = diffMs / 7 / 24 / 60 / 60 / 1000;
        unit = 'week';
    } else if (absDiff < 365 * 24 * 60 * 60 * 1000) {
        value = diffMs / 30 / 24 / 60 / 60 / 1000;
        unit = 'month';
    } else {
        value = diffMs / 365 * 24 * 60 * 60 * 1000;
        unit = 'year';
    }

    return relativeTimeFormatter.format(Math.round(value), unit);
};

const numberFormatter = new Intl.NumberFormat([], {});
export const formatNumber = (value: number): string => {
    return numberFormatter.format(value);
};

export const formatFileSize = (numBytes: number): string => {
    let unit: string;
    let value = numBytes;

    const kilobyte = 1000;
    const megabyte = kilobyte ** 2;
    const gigabyte = kilobyte ** 3;
    if (value < kilobyte) {
        unit = 'byte';
    } else if (value < megabyte) {
        unit = 'kilobyte';
        value /= kilobyte;
    } else if (value < gigabyte) {
        unit = 'megabyte';
        value /= megabyte;
    } else {
        unit = 'gigabyte';
        value /= gigabyte;
    }

    const fileSizeFormatter = new Intl.NumberFormat([], {
        style: 'unit',
        unit,
        unitDisplay: 'short',
        maximumFractionDigits: 2,
    });

    return fileSizeFormatter.format(value);
};
