/*
Drop a column from the row object.
*/
export function suppressColumn(row: Record<string, string>, column: string): void {
  delete row[column];
}
