/**
 * Defines the contract for performing HTTP network requests.
 */
export interface NetworkClient {
  /** Performs a GET request to `url` and returns the response body as a string. */
  get(url: string): Promise<string>;
  /** Performs a POST request to `url` with `body` and returns the response body. */
  post(url: string, body: string): Promise<string>;
}

/**
 * A {@link NetworkClient} backed by the global `fetch` API.
 */
export class FetchNetworkClient implements NetworkClient {
  async get(url: string): Promise<string> {
    const response = await fetch(url);
    return response.text();
  }

  async post(url: string, body: string): Promise<string> {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    return response.text();
  }
}
