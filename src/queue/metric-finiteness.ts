export function areMetricNumbersFinite(value: unknown): boolean {
  return areMetricNumbersFiniteValue(value, new WeakSet<object>());
}

function areMetricNumbersFiniteValue(
  value: unknown,
  visited: WeakSet<object>,
): boolean {
  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (value === null || typeof value !== "object") {
    return true;
  }

  if (visited.has(value)) {
    return true;
  }

  visited.add(value);

  if (Array.isArray(value)) {
    return Object.values(value).every((item) =>
      areMetricNumbersFiniteValue(item, visited),
    );
  }

  if (!isPlainObject(value)) {
    return true;
  }

  return Object.values(value).every((item) =>
    areMetricNumbersFiniteValue(item, visited),
  );
}

function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
