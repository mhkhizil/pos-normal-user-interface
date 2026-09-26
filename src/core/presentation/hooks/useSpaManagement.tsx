import { useCallback, useMemo, useRef, useState } from "react";
import {
  ChargeSpaItemsDTO,
  CloseSpaSessionDTO,
  ExtendSpaSessionDTO,
  CreateSpaRoomDTO,
  OpenSpaSessionDTO,
  UpdateSpaRoomDTO,
} from "../../application/dtos/SpaDTO";
import { SpaRoom, SpaSessionQuote } from "../../domain/entities/Spa";
import { ISpaService } from "../../domain/services/ISpaService";
import container from "../../infrastructure/di/container";
import { findActiveSpaSession } from "@/lib/spa/session";

export function useSpaManagement() {
  const service = container.resolve<ISpaService>("spaService");
  const [rooms, setRooms] = useState<SpaRoom[]>([]);
  const [quote, setQuote] = useState<SpaSessionQuote | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boardRequestRef = useRef<Promise<SpaRoom[]> | null>(null);

  const run = useCallback(async <T,>(operation: () => Promise<T>): Promise<T> => {
    setIsLoading(true);
    setError(null);
    try {
      return await operation();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "SPA request failed");
      throw caught;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchBoard = useCallback(
    async (locationId?: string) => {
      if (boardRequestRef.current) return boardRequestRef.current;
      const request = run(async () => {
        const result = await service.getBoard(locationId);
        setRooms(result);
        return result;
      }).finally(() => {
        boardRequestRef.current = null;
      });
      boardRequestRef.current = request;
      return request;
    },
    [run, service]
  );

  const createRoom = useCallback(
    (payload: CreateSpaRoomDTO) =>
      run(async () => {
        const created = await service.createRoom(payload);
        setRooms((current) => [created, ...current]);
        return created;
      }),
    [run, service]
  );

  const updateRoom = useCallback(
    (id: string, payload: UpdateSpaRoomDTO) =>
      run(async () => {
        const updated = await service.updateRoom(id, payload);
        setRooms((current) =>
          current.map((room) =>
            room.id === id ? { ...updated, sessions: room.sessions } : room
          )
        );
        return updated;
      }),
    [run, service]
  );

  const deleteRoom = useCallback(
    (id: string) =>
      run(async () => {
        const deleted = await service.deleteRoom(id);
        setRooms((current) => current.filter((room) => room.id !== id));
        return deleted;
      }),
    [run, service]
  );

  const markRoomReady = useCallback(
    (id: string) =>
      run(async () => {
        const updated = await service.markRoomReady(id);
        setRooms((current) =>
          current.map((room) => (room.id === id ? updated : room))
        );
        return updated;
      }),
    [run, service]
  );

  const openSession = useCallback(
    (payload: OpenSpaSessionDTO) => run(() => service.openSession(payload)),
    [run, service]
  );

  const getQuote = useCallback(
    (id: string) =>
      run(async () => {
        const result = await service.getQuote(id);
        setQuote(result);
        return result;
      }),
    [run, service]
  );

  const pauseSession = useCallback(
    (id: string) => run(() => service.pauseSession(id)),
    [run, service]
  );

  const resumeSession = useCallback(
    (id: string) => run(() => service.resumeSession(id)),
    [run, service]
  );

  const closeSession = useCallback(
    (id: string, payload: CloseSpaSessionDTO) =>
      run(async () => {
        const result = await service.closeSession(id, payload);
        setQuote(result);
        return result;
      }),
    [run, service]
  );

  const extendSession = useCallback(
    (id: string, payload: ExtendSpaSessionDTO) =>
      run(async () => {
        const result = await service.extendSession(id, payload);
        setQuote(result.quote);
        return result;
      }),
    [run, service]
  );

  const chargeItems = useCallback(
    (id: string, payload: ChargeSpaItemsDTO) =>
      run(async () => {
        const result = await service.chargeItems(id, payload);
        setQuote(result.quote);
        return result;
      }),
    [run, service]
  );

  const refundLine = useCallback(
    (id: string, lineId: string, reason?: string) =>
      run(async () => {
        const result = await service.refundLine(id, lineId, reason);
        setQuote(result.quote);
        return result;
      }),
    [run, service]
  );

  const activeSessionByRoomId = useMemo(
    () =>
      Object.fromEntries(
        rooms.map((room) => [room.id, findActiveSpaSession(room)])
      ),
    [rooms]
  );

  return {
    rooms,
    quote,
    isLoading,
    error,
    activeSessionByRoomId,
    fetchBoard,
    createRoom,
    updateRoom,
    deleteRoom,
    markRoomReady,
    openSession,
    getQuote,
    pauseSession,
    resumeSession,
    closeSession,
    extendSession,
    chargeItems,
    refundLine,
    clearQuote: () => setQuote(null),
    clearError: () => setError(null),
  };
}
