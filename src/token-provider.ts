export interface LineWorksTokenProvider {
  getAccessToken(): Promise<string>;
}

export class StaticLineWorksTokenProvider implements LineWorksTokenProvider {
  constructor(private readonly accessToken: string) {}

  async getAccessToken(): Promise<string> {
    return this.accessToken;
  }
}
