import { useCallback, useState } from "react";
import container from "../../infrastructure/di/container";
import type { ApiHostessRepository } from "../../infrastructure/repositories/ApiHostessRepository";
import type { Hostess } from "../../domain/entities/Hostess";

/** The hostesses working now, loaded when the till needs to pick one. */
export function useWorkingHostesses() {
  const [hostesses, setHostesses] = useState<Hostess[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const repository = container.resolve<ApiHostessRepository>("hostessRepository");
      setHostesses(await repository.working());
      setLoadedAt(Date.now());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't load hostesses");
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { hostesses, isLoading, error, load, loadedAt };
}
