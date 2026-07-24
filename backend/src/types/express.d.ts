declare global {
  namespace Express {
    interface Request {
      user?: string;
      accessToken?: string;
    }
  }
}

export {};
