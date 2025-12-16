export const toPascalCase = (text: string) => text
    .split(' ')
    .map(word => (word[0]?.toUpperCase() + word.slice(1)).replace(/\W/ig, '') || '')
    .filter(Boolean)
    .join('');
