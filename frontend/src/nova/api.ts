const TOKEN = "nova-token";
export const session = {
  get: () => sessionStorage.getItem(TOKEN),
  set: (token: string) => sessionStorage.setItem(TOKEN, token),
  clear: () => sessionStorage.removeItem(TOKEN),
};
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public uncertain = false,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    signal?: AbortSignal;
    auth?: boolean;
  } = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  const token = options.auth === false ? null : session.get();
  try {
    const res = await fetch("/api" + path, {
      method: options.method || "GET",
      headers: {
        ...(options.body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body:
        options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      if (res.status === 401 && token && session.get() === token) {
        session.clear();
        window.dispatchEvent(new Event("nova-session-expired"));
      }
      const message = data?.message;
      throw new ApiError(
        Array.isArray(message)
          ? message.join(" ")
          : typeof message === "string"
            ? message
            : `Yêu cầu thất bại (${res.status}).`,
        res.status,
        res.status >= 500,
      );
    }
    if (token && session.get() !== token)
      throw new ApiError("Phiên đăng nhập đã thay đổi. Vui lòng tải lại.", 401, options.method === "POST" && path === "/orders");
    if (res.status === 204) return undefined as T;
    if (data === null)
      throw new ApiError("Phản hồi máy chủ không hợp lệ.", 502, true);
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      "Không thể xác nhận kết quả từ máy chủ. Vui lòng kiểm tra kết nối.",
      0,
      true,
    );
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abort);
  }
}
