export function debounce(fn, delay = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

export const pick = (object, keys) =>
    Object.fromEntries(keys.filter((key) => key in object).map((key) => [key, object[key]]));

export function groupBy(items, getKey) {
    const groups = new Map();
    for (const item of items) {
        const key = getKey(item);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(item);
    }
    return groups;
}
