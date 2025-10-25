import type { ResultSetHeader } from "mysql2";

export const getInsertId = (result: unknown): number | null => {
  const insertId = (result as Partial<ResultSetHeader>)?.insertId;
  if (!insertId) {
    return null;
  }

  return Number(insertId);
};

export const getAffectedRows = (result: unknown): number => {
  return (result as Partial<ResultSetHeader>)?.affectedRows ?? 0;
};
