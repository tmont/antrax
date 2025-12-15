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
        value = diffMs / 24 / 60 / 1000;
        unit = 'hour';
    } else if (absDiff < 30 * 24 * 60 * 60 * 1000) {
        value = diffMs / 24 / 60 / 1000;
        unit = 'day';
    } else if (absDiff < 3 * 30 * 24 * 60 * 60 * 1000) {
        value = diffMs / 7 / 24 / 60 / 1000;
        unit = 'week';
    } else if (absDiff < 365 * 24 * 60 * 60 * 1000) {
        value = diffMs / 30 / 24 / 60 / 1000;
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

    if (value < 1024) {
        unit = 'byte';
    } else if (value < 1024 * 1024) {
        unit = 'kilobyte';
        value /= 1024;
    } else if (value < 1024 * 1024 * 1024) {
        unit = 'megabyte';
        value /= 1024 / 1024;
    } else {
        unit = 'gigabyte';
        value /= 1024 / 1024 / 1024;
    }

    const fileSizeFormatter = new Intl.NumberFormat([], {
        style: 'unit',
        unit,
        unitDisplay: 'short',
        maximumFractionDigits: 2,
    });

    return fileSizeFormatter.format(value);
};
