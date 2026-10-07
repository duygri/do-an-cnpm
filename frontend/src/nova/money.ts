export function cents(value: string): bigint {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error("Giá không hợp lệ");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}
export function decimal(value: bigint): string {
  return `${value / 100n}.${(value % 100n).toString().padStart(2, "0")}`;
}
export function money(value: string): string {
  const amount = cents(value);
  const fraction = amount % 100n;
  return (
    (amount / 100n).toLocaleString("vi-VN") +
    (fraction ? "," + fraction.toString().padStart(2, "0") : "") +
    " ₫"
  );
}
