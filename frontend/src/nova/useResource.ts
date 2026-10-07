import { useEffect, useState } from "react";
import { api } from "./api";
export function useResource<T>(path: string, revision = 0) {
  const [state, setState] = useState<{
    path: string;
    data?: T;
    error?: string;
    loading: boolean;
  }>({ path, loading: true });
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setState({ path, loading: true });
    api<T>(path, { signal: controller.signal })
      .then((data) => {
        if (active) setState({ path, data, loading: false });
      })
      .catch((e: Error) => {
        if (active) setState({ path, error: e.message, loading: false });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [path, revision]);
  return state.path === path ? state : { path, loading: true };
}
