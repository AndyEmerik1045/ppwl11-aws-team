export interface DbClient {
  user: {
    findMany: () => Promise<any[]>;
  };
}
