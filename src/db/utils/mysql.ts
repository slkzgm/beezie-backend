import type { ResultSetHeader } from 'mysql2';

const unwrapResultHeader = (result: unknown): Partial<ResultSetHeader> | undefined => {
  if (!result) {
    return undefined;
  }

  if (Array.isArray(result)) {
    const [header] = result as [ResultSetHeader | undefined, ...unknown[]];
    return header;
  }

  return result as Partial<ResultSetHeader>;
};

export const getInsertId = (result: unknown): number | null => {
  const header = unwrapResultHeader(result);
  const insertId = header?.insertId;
  if (!insertId) {
    return null;
  }

  return Number(insertId);
};

export const getAffectedRows = (result: unknown): number => {
  const header = unwrapResultHeader(result);
  return header?.affectedRows ?? 0;
};
