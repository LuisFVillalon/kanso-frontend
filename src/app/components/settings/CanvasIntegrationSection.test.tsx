// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasConnection, CanvasErrorCode } from '@/app/types/canvas';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const api = vi.hoisted(() => {
  class ApiError extends Error {
    constructor(readonly status: number, readonly detail: string) {
      super(detail);
    }
  }
  return {
    ApiError,
    describeError: (err: unknown, fallback: string) =>
      err instanceof ApiError && [400, 403, 404, 409, 429].includes(err.status) ? err.detail : fallback,
    fetchCanvasConnection: vi.fn(),
    connectCanvas: vi.fn(),
    connectCanvasFeed: vi.fn(),
    testCanvasConnection: vi.fn(),
    updateCanvasHiddenCourses: vi.fn(),
    removeCanvasConnection: vi.fn(),
    fetchCanvasCourses: vi.fn(),
    fetchCanvasClasses: vi.fn(),
  };
});
vi.mock('@/app/lib/backend-api', () => api);

import CanvasIntegrationSection, { canvasErrorMessage, canvasStatusLine, canvasView } from './CanvasIntegrationSection';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-21T12:00:00Z');
const inDays = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString();

const notConnected: CanvasConnection = {
  connected: false, status: null, base_url: null, token_last4: null, canvas_user_id: null, canvas_user_name: null,
  token_expires_at: null, hidden_course_ids: [], created_at: null, updated_at: null, last_synced_at: null, last_error_at: null,
};
const connected = (overrides: Partial<CanvasConnection> = {}): CanvasConnection => ({
  ...notConnected,
  connected: true,
  status: 'active',
  base_url: 'https://sdsu.instructure.com',
  token_last4: '7Hq2',
  canvas_user_id: 42,
  canvas_user_name: 'Luis Villalon',
  token_expires_at: inDays(72),
  created_at: inDays(-19),
  ...overrides,
});
const feedConnected = (overrides: Partial<CanvasConnection> = {}): CanvasConnection => connected({
  connection_type: 'feed',
  capabilities: {
    upcoming: true, missing: false, recently_graded: false, courses: false, modules: false, assignments: false,
    announcements: false, link_tasks: true, submission_status: false,
  },
  token_last4: 'T0ke',
  feed_url_masked: 'https://sdsu.instructure.com/feeds/calendars/user_…T0ke.ics',
  canvas_user_id: null,
  canvas_user_name: null,
  token_expires_at: null,
  ...overrides,
});
const FEED_URL = 'https://sdsu.instructure.com/feeds/calendars/user_s3cr3tFeedT0ken.ics';
const apiError = (status: number, code: CanvasErrorCode | string) => new api.ApiError(status, code);

let container: HTMLDivElement;
let root: Root;

const render = async (isDemo = false) => {
  await act(async () => root.render(<CanvasIntegrationSection isDemo={isDemo} />));
};
const text = () => container.textContent ?? '';
const button = (label: string) =>
  [...container.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === label)!;
const click = async (el: HTMLElement) => { await act(async () => { el.click(); }); };
const status = () => container.querySelector('[data-testid="canvas-status"]')?.textContent;
const tokenInput = () => container.querySelector<HTMLInputElement>('#canvas-token')!;
const urlInput = () => container.querySelector<HTMLInputElement>('#canvas-url')!;
const feedInput = () => container.querySelector<HTMLInputElement>('#canvas-feed')!;
const useToken = () => click(button('Use an access token if your school allows it'));

/** Sets a controlled input's value the way React notices. */
const typeInto = (el: HTMLInputElement, value: string) => {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const submitForm = async () => {
  await act(async () => { container.querySelector('form')!.requestSubmit(); });
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  api.fetchCanvasCourses.mockRejectedValue(apiError(404, 'Not Found'));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('canvasView and canvasStatusLine', () => {
  it('derives each state from the connection', () => {
    expect(canvasView(notConnected, NOW)).toBe('not-connected');
    expect(canvasView(connected(), NOW)).toBe('active');
    expect(canvasView(connected({ token_expires_at: null }), NOW)).toBe('active');
    expect(canvasView(connected({ token_expires_at: inDays(6) }), NOW)).toBe('expiring');
    expect(canvasView(connected({ status: 'error' }), NOW)).toBe('error');
    expect(canvasView(connected({ status: 'invalid' }), NOW)).toBe('invalid');
    expect(canvasView(connected({ token_expires_at: inDays(-1) }), NOW)).toBe('invalid');
  });

  it('masks the token as its last four characters', () => {
    expect(canvasStatusLine(connected(), NOW)).toBe('Connected · ends in …7Hq2');
    expect(canvasStatusLine(connected({ token_expires_at: inDays(6) }), NOW)).toBe('Connected · ends in …7Hq2 · expires in 6 days');
    expect(canvasStatusLine(connected({ status: 'error' }), NOW)).toBe("Connected · ends in …7Hq2 · couldn't reach Canvas");
    expect(canvasStatusLine(connected({ status: 'invalid' }), NOW)).toBe('Not syncing · Canvas rejected the token');
    expect(canvasStatusLine(connected({ status: 'invalid', token_expires_at: inDays(-2) }), NOW)).toBe('Not syncing · the token expired');
  });

  it('names a calendar feed connection without any part of the link', () => {
    expect(canvasView(feedConnected(), NOW)).toBe('active');
    expect(canvasStatusLine(feedConnected(), NOW)).toBe('Connected · calendar feed');
    expect(canvasStatusLine(feedConnected({ status: 'error' }), NOW)).toBe("Connected · calendar feed · couldn't reach Canvas");
    expect(canvasStatusLine(feedConnected({ status: 'invalid' }), NOW)).toBe('Not syncing · Canvas stopped serving the feed');
  });
});

describe('canvasErrorMessage', () => {
  it.each([
    [422, 'canvas_url_invalid', "isn't a Canvas address kanso can use"],
    [422, 'canvas_not_canvas', "couldn't find a Canvas site at this address"],
    [422, 'canvas_token_invalid', "Canvas didn't accept this token"],
    [422, 'canvas_feed_url_invalid', "isn't a Canvas calendar feed link"],
    [422, 'canvas_feed_invalid', "Canvas doesn't know this calendar feed link"],
    [422, 'canvas_forbidden', "wouldn't share your account details"],
    [409, 'canvas_account_changed', 'different Canvas account or school'],
    [502, 'canvas_unavailable', "Canvas couldn't be reached right now"],
    [404, 'canvas_not_connected', "Canvas isn't connected anymore"],
    [503, 'canvas_not_configured', "Canvas isn't available yet"],
  ])('explains %i %s', (statusCode, code, expected) => {
    expect(canvasErrorMessage(apiError(statusCode, code), 'fallback')).toContain(expected);
  });

  it("uses the server's reason for a rate limit and the fallback for anything else", () => {
    expect(canvasErrorMessage(apiError(429, 'Too many requests. Please wait a moment and try again.'), 'fallback'))
      .toBe('Too many requests. Please wait a moment and try again.');
    expect(canvasErrorMessage(apiError(500, 'Internal Server Error'), 'fallback')).toBe('fallback');
    expect(canvasErrorMessage(new Error('offline'), 'fallback')).toBe('fallback');
  });
});

describe('CanvasIntegrationSection', () => {
  it('recommends the calendar feed when not connected, with its how-to and what it gives', async () => {
    api.fetchCanvasConnection.mockResolvedValue(notConnected);
    await render();
    expect(text()).toContain('Connect with your calendar feed');
    expect(text()).toContain('Recommended');
    expect(text()).toContain('How do I find my calendar feed link?');
    expect(text()).toContain('Calendar Feed');
    expect(feedInput().type).toBe('password');
    expect(container.querySelector('#canvas-token')).toBeNull();
    expect(button('Connect')).toBeTruthy();
    const note = container.querySelector('[data-testid="canvas-feed-note"]')?.textContent;
    expect(note).toContain('read-only and needs no approval from your school');
    expect(note).toContain('upcoming assignments and due dates only');
    expect(note).toContain('Anyone with the link can see your Canvas calendar');
  });

  it('opens the home page\'s closed Canvas tab again, and says nothing while it shows', async () => {
    api.fetchCanvasConnection.mockResolvedValue(notConnected);
    const changes: boolean[] = [];
    const renderTab = (hidden: boolean) => act(async () => root.render(
      <CanvasIntegrationSection isDemo={false} homeCanvasTab={{ hidden, onChange: next => { changes.push(next); } }} />,
    ));
    await renderTab(true);
    expect(text()).toContain('The Canvas tab is closed on your home page.');
    await click(button('Show it again'));
    expect(changes).toEqual([false]);
    await renderTab(false);
    expect(text()).not.toContain('Canvas tab');
  });

  it('says nothing about the home page\'s Canvas tab once connected', async () => {
    api.fetchCanvasConnection.mockResolvedValue(feedConnected());
    await act(async () => root.render(<CanvasIntegrationSection isDemo={false} homeCanvasTab={{ hidden: true, onChange: () => {} }} />));
    expect(text()).not.toContain('Canvas tab');
  });

  it('offers the access token as the other way to connect, and back', async () => {
    api.fetchCanvasConnection.mockResolvedValue(notConnected);
    await render();
    await useToken();
    expect(text()).toContain('How do I get a Canvas token?');
    expect(tokenInput().type).toBe('password');
    expect(container.querySelector('#canvas-feed')).toBeNull();
    expect(text()).toContain('never sent back to your browser');
    await click(button('Use your calendar feed link instead (recommended)'));
    expect(feedInput()).toBeTruthy();
  });

  it('connects with the feed link, then clears it and never shows it', async () => {
    api.fetchCanvasConnection.mockResolvedValue(notConnected);
    api.connectCanvasFeed.mockResolvedValue(feedConnected());
    await render();
    const input = feedInput();
    input.value = FEED_URL;
    await submitForm();
    expect(api.connectCanvasFeed).toHaveBeenCalledWith(FEED_URL, false);
    expect(api.connectCanvas).not.toHaveBeenCalled();
    expect(input.value).toBe('');
    expect(status()).toBe('Connected · calendar feed');
    expect(container.querySelector('[data-testid="canvas-type"]')?.textContent).toContain('Calendar feed · read-only');
    expect(container.querySelector('[data-testid="canvas-feed-masked"]')?.textContent)
      .toBe('https://sdsu.instructure.com/feeds/calendars/user_…T0ke.ics');
    expect(text()).toContain('Canvas connected.');
    expect(text()).not.toContain('s3cr3tFeedT0ken');
    expect(text()).not.toContain('•••• ••••');
    expect(container.querySelector('#canvas-feed')).toBeNull();
    // The feed has no courses, so there's nothing to choose.
    expect(api.fetchCanvasCourses).not.toHaveBeenCalled();
  });

  it('asks for the link before sending an empty feed form', async () => {
    api.fetchCanvasConnection.mockResolvedValue(notConnected);
    await render();
    await submitForm();
    expect(api.connectCanvasFeed).not.toHaveBeenCalled();
    expect(container.querySelector('#canvas-feed-error')?.textContent).toContain('Paste the calendar feed link');
  });

  it('shows a link Canvas will not serve under the feed field and keeps the form', async () => {
    api.fetchCanvasConnection.mockResolvedValue(notConnected);
    api.connectCanvasFeed.mockRejectedValue(apiError(422, 'canvas_feed_invalid'));
    await render();
    feedInput().value = 'https://sdsu.instructure.com/not-a-feed';
    await submitForm();
    expect(container.querySelector('#canvas-feed-error')?.textContent).toContain("Canvas doesn't know this calendar feed link");
    expect(feedInput().getAttribute('aria-invalid')).toBe('true');
  });

  it.each([
    ['canvas_feed_url_invalid', "isn't a Canvas calendar feed link"],
    ['canvas_url_invalid', 'starts with https:// or webcal://'],
    ['canvas_not_canvas', "isn't a Canvas calendar"],
  ])('explains %s under the feed field in terms of the link', async (code, message) => {
    api.fetchCanvasConnection.mockResolvedValue(notConnected);
    api.connectCanvasFeed.mockRejectedValue(apiError(422, code));
    await render();
    feedInput().value = 'webcal://example.com/calendar.ics';
    await submitForm();
    expect(container.querySelector('#canvas-feed-error')?.textContent).toContain(message);
    expect(text()).not.toContain('example.com');
  });

  it('asks before a feed link for a different account replaces the connection', async () => {
    api.fetchCanvasConnection.mockResolvedValue(feedConnected());
    api.connectCanvasFeed
      .mockRejectedValueOnce(apiError(409, 'canvas_account_changed'))
      .mockResolvedValueOnce(feedConnected({ canvas_user_name: 'Other Person' }));
    await render();
    await click(button('Replace'));
    feedInput().value = FEED_URL;
    await submitForm();
    expect(text()).toContain("This link is for a different school's Canvas.");
    await click(button('Switch account'));
    expect(api.connectCanvasFeed).toHaveBeenLastCalledWith(FEED_URL, true);
    expect(text()).toContain('Canvas connected as Other Person.');
  });

  it('shows a feed connection with Test, Replace and Remove, and replaces it with a token if asked', async () => {
    api.fetchCanvasConnection.mockResolvedValue(feedConnected());
    api.connectCanvas.mockResolvedValue(connected());
    await render();
    expect(status()).toBe('Connected · calendar feed');
    expect(text()).toContain('sdsu.instructure.com');
    expect(button('Test')).toBeTruthy();
    expect(button('Remove')).toBeTruthy();
    expect(container.querySelector('[data-testid="canvas-feed-note"]')).not.toBeNull();
    await click(button('Replace'));
    expect(text()).toContain('Paste a new calendar feed link');
    await useToken();
    typeInto(urlInput(), 'sdsu.instructure.com');
    tokenInput().value = '7~secretsecretsecretsecret7Hq2';
    await submitForm();
    expect(api.connectCanvas).toHaveBeenCalledWith('sdsu.instructure.com', '7~secretsecretsecretsecret7Hq2', false);
    expect(status()).toBe('Connected · ends in …7Hq2');
    expect(container.querySelector('[data-testid="canvas-type"]')?.textContent).toBe('Access token');
  });

  it('reports a successful feed test', async () => {
    api.fetchCanvasConnection.mockResolvedValue(feedConnected());
    api.testCanvasConnection.mockResolvedValue(feedConnected());
    await render();
    await click(button('Test'));
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Canvas served the calendar feed');
  });

  it('asks for the current feed link when Canvas stopped serving it', async () => {
    api.fetchCanvasConnection.mockResolvedValue(feedConnected({ status: 'invalid', last_error_at: inDays(-3) }));
    await render();
    expect(status()).toBe('Not syncing · Canvas stopped serving the feed');
    expect(text()).toContain('Canvas stopped serving your calendar feed link');
    expect(feedInput()).toBeTruthy();
    expect(button('Reconnect Canvas')).toBeTruthy();
    expect(button('Remove instead')).toBeTruthy();
  });

  it('removes a feed connection after confirming', async () => {
    api.fetchCanvasConnection.mockResolvedValue(feedConnected());
    api.removeCanvasConnection.mockResolvedValue(undefined);
    await render();
    await click(button('Remove'));
    expect(text()).toContain('permanently deletes your calendar feed link');
    await click(button('Remove permanently'));
    expect(text()).toContain('Canvas removed. The calendar feed link was deleted from kanso.');
    expect(feedInput()).toBeTruthy();
  });

  it('connects with a token, then clears it and shows only its last four characters', async () => {
    api.fetchCanvasConnection.mockResolvedValue(notConnected);
    api.connectCanvas.mockResolvedValue(connected());
    await render();
    await useToken();
    typeInto(urlInput(), 'sdsu.instructure.com');
    const input = tokenInput();
    input.value = '7~secretsecretsecretsecret7Hq2';
    await submitForm();
    expect(api.connectCanvas).toHaveBeenCalledWith('sdsu.instructure.com', '7~secretsecretsecretsecret7Hq2', false);
    expect(input.value).toBe('');
    expect(status()).toBe('Connected · ends in …7Hq2');
    expect(text()).toContain('Canvas connected as Luis Villalon.');
    expect(text()).not.toContain('secretsecret');
    expect(container.querySelector('#canvas-token')).toBeNull();
  });

  it('leaves the name out of the success notice when Canvas gives none', async () => {
    api.fetchCanvasConnection.mockResolvedValue(notConnected);
    api.connectCanvas.mockResolvedValue(connected({ canvas_user_name: null }));
    await render();
    await useToken();
    typeInto(urlInput(), 'sdsu.instructure.com');
    tokenInput().value = '7~secretsecretsecretsecret7Hq2';
    await submitForm();
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Canvas connected.');
    expect(text()).not.toContain('null');
  });

  it('shows a rejected token under the token field and keeps the form', async () => {
    api.fetchCanvasConnection.mockResolvedValue(notConnected);
    api.connectCanvas.mockRejectedValue(apiError(422, 'canvas_token_invalid'));
    await render();
    await useToken();
    typeInto(urlInput(), 'sdsu.instructure.com');
    tokenInput().value = '7~badbadbadbadbadbad';
    await submitForm();
    expect(container.querySelector('#canvas-token-error')?.textContent).toContain("Canvas didn't accept this token");
    expect(tokenInput().getAttribute('aria-invalid')).toBe('true');
  });

  it('shows an address that is not Canvas under the address field', async () => {
    api.fetchCanvasConnection.mockResolvedValue(notConnected);
    api.connectCanvas.mockRejectedValue(apiError(422, 'canvas_not_canvas'));
    await render();
    await useToken();
    typeInto(urlInput(), 'example.com');
    tokenInput().value = '7~tokentokentokentoken';
    await submitForm();
    expect(container.querySelector('#canvas-url-error')?.textContent).toContain("couldn't find a Canvas site");
  });

  it("says Canvas isn't available yet when the server has no encryption key", async () => {
    api.fetchCanvasConnection.mockResolvedValue(notConnected);
    api.connectCanvas.mockRejectedValue(apiError(503, 'canvas_not_configured'));
    await render();
    await useToken();
    typeInto(urlInput(), 'sdsu.instructure.com');
    tokenInput().value = '7~tokentokentokentoken';
    await submitForm();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Canvas isn't available yet");
  });

  it('asks before switching to a different Canvas account, then resends with the confirmation', async () => {
    api.fetchCanvasConnection.mockResolvedValue(connected());
    api.connectCanvas
      .mockRejectedValueOnce(apiError(409, 'canvas_account_changed'))
      .mockResolvedValueOnce(connected({ canvas_user_id: 7, canvas_user_name: 'Other Person', token_last4: 'Zz99' }));
    await render();
    await click(button('Replace'));
    tokenInput().value = '7~othertokenothertokenZz99';
    await submitForm();
    expect(text()).toContain('different Canvas account or school');
    await click(button('Switch account'));
    expect(api.connectCanvas).toHaveBeenLastCalledWith('https://sdsu.instructure.com', '7~othertokenothertokenZz99', true);
    expect(status()).toBe('Connected · ends in …Zz99');
  });

  it('shows the masked connection with account, Test, Replace and Remove', async () => {
    api.fetchCanvasConnection.mockResolvedValue(connected());
    await render();
    expect(status()).toBe('Connected · ends in …7Hq2');
    expect(text()).toContain('sdsu.instructure.com');
    expect(text()).toContain('Luis Villalon');
    expect(text()).toContain('•••• •••• 7Hq2');
    expect(button('Test')).toBeTruthy();
    expect(button('Replace')).toBeTruthy();
    expect(button('Remove')).toBeTruthy();
    expect(container.querySelector('#canvas-token')).toBeNull();
  });

  it('warns when the token expires within a week', async () => {
    api.fetchCanvasConnection.mockResolvedValue(connected({ token_expires_at: inDays(6) }));
    await render();
    expect(status()).toBe('Connected · ends in …7Hq2 · expires in 6 days');
    expect(text()).toContain('Your token expires');
  });

  it('shows Reconnect Canvas when the token is invalid', async () => {
    api.fetchCanvasConnection.mockResolvedValue(connected({ status: 'invalid', last_error_at: inDays(-3) }));
    await render();
    expect(status()).toBe('Not syncing · Canvas rejected the token');
    expect(text()).toContain('Canvas stopped accepting your token');
    expect(button('Reconnect Canvas')).toBeTruthy();
    expect(button('Remove instead')).toBeTruthy();
    expect(urlInput().value).toBe('https://sdsu.instructure.com');
    expect(api.fetchCanvasCourses).not.toHaveBeenCalled();
  });

  it("shows the last check's failure when the status is error", async () => {
    api.fetchCanvasConnection.mockResolvedValue(connected({ status: 'error' }));
    await render();
    expect(text()).toContain("kanso couldn't reach Canvas the last time it checked");
    expect(button('Test')).toBeTruthy();
  });

  it('tests the token and moves to Reconnect when Canvas now rejects it', async () => {
    api.fetchCanvasConnection.mockResolvedValue(connected());
    api.testCanvasConnection.mockResolvedValue(connected({ status: 'invalid' }));
    await render();
    await click(button('Test'));
    expect(button('Reconnect Canvas')).toBeTruthy();
  });

  it('reports a successful test', async () => {
    api.fetchCanvasConnection.mockResolvedValue(connected());
    api.testCanvasConnection.mockResolvedValue(connected());
    await render();
    await click(button('Test'));
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Canvas accepted the token');
  });

  it('reloads the recorded status when Canvas is unreachable during a test', async () => {
    api.fetchCanvasConnection.mockResolvedValueOnce(connected()).mockResolvedValueOnce(connected({ status: 'error' }));
    api.testCanvasConnection.mockRejectedValue(apiError(502, 'canvas_unavailable'));
    await render();
    await click(button('Test'));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Canvas couldn't be reached right now");
    expect(status()).toBe("Connected · ends in …7Hq2 · couldn't reach Canvas");
  });

  it('removes only after confirming, then shows the connect form', async () => {
    api.fetchCanvasConnection.mockResolvedValue(connected());
    api.removeCanvasConnection.mockResolvedValue(undefined);
    await render();
    await click(button('Remove'));
    expect(api.removeCanvasConnection).not.toHaveBeenCalled();
    expect(text()).toContain('permanently deletes your token');
    await click(button('Remove permanently'));
    expect(api.removeCanvasConnection).toHaveBeenCalledOnce();
    expect(text()).toContain('Canvas removed. The token was deleted from kanso.');
    expect(button('Connect')).toBeTruthy();
  });

  it('shows the error and offers a retry when the status fails to load', async () => {
    api.fetchCanvasConnection.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(notConnected);
    await render();
    expect(text()).toContain("Couldn't load your Canvas connection.");
    await click(button('Try again'));
    expect(button('Connect')).toBeTruthy();
  });

  it('says Canvas is unavailable in the demo without calling the API', async () => {
    await render(true);
    expect(text()).toContain("Canvas isn't available in the demo.");
    expect(api.fetchCanvasConnection).not.toHaveBeenCalled();
    expect(container.querySelector('#canvas-token')).toBeNull();
  });

  it("shows the server's reason when it refuses the account with 403", async () => {
    api.fetchCanvasConnection.mockRejectedValue(apiError(403, "Canvas can't be connected to a demo sandbox."));
    await render();
    expect(text()).toContain("Canvas can't be connected to a demo sandbox.");
    expect(text()).toContain("Canvas isn't available for this account.");
    expect(text()).not.toContain('in the demo');
  });

  it('tells a feed connection what an access token would add, and says nothing of it for a token', async () => {
    api.fetchCanvasConnection.mockResolvedValue(feedConnected());
    await render();
    const note = container.querySelector('[data-testid="canvas-token-extras-note"]')?.textContent;
    expect(note).toContain('access token instead, if your school allows it, also shows your grades, modules');
    expect(note).toContain('announcements');
    act(() => root.unmount());
    root = createRoot(container);
    api.fetchCanvasConnection.mockResolvedValue(connected());
    await render();
    expect(container.querySelector('[data-testid="canvas-token-extras-note"]')).toBeNull();
  });

  it("lists a feed's classes under Courses to show and saves the hidden ones", async () => {
    api.fetchCanvasConnection.mockResolvedValue(feedConnected({
      capabilities: { ...feedConnected().capabilities!, classes: true }, hidden_course_ids: [3],
    }));
    api.fetchCanvasClasses.mockResolvedValue({
      fetched_at: NOW.toISOString(), busy: false, stale: false, sample: false,
      classes: [
        { id: 1, code: 'CS 460-01', name: null, term: null, html_url: null, hidden: false, due_this_week: 1, upcoming: 4, next_due: null },
        { id: 3, code: 'ART 157-02', name: null, term: null, html_url: null, hidden: true, due_this_week: 0, upcoming: 2, next_due: null },
      ],
    });
    api.updateCanvasHiddenCourses.mockResolvedValue(feedConnected({ hidden_course_ids: [1, 3] }));
    await render();
    expect(api.fetchCanvasCourses).not.toHaveBeenCalled();
    expect(text()).toContain('Courses to show');
    expect(text()).toContain('CS 460-01');
    const boxes = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    expect([...boxes].map(b => b.checked)).toEqual([true, false]);
    await click(boxes[0]);
    expect(api.updateCanvasHiddenCourses).toHaveBeenCalledWith([1, 3]);
  });

  it('leaves out Courses to show while the courses route does not answer', async () => {
    api.fetchCanvasConnection.mockResolvedValue(connected());
    await render();
    expect(api.fetchCanvasCourses).toHaveBeenCalledOnce();
    expect(text()).not.toContain('Courses to show');
  });

  it('lists courses and saves the hidden ones', async () => {
    api.fetchCanvasConnection.mockResolvedValue(connected({ hidden_course_ids: [3] }));
    api.fetchCanvasCourses.mockResolvedValue([
      { id: 1, name: 'Operating Systems', course_code: 'CS 460' },
      { id: 3, name: 'Academic Integrity Tutorial', course_code: 'TRAIN 001' },
    ]);
    api.updateCanvasHiddenCourses.mockResolvedValue(connected({ hidden_course_ids: [1, 3] }));
    await render();
    expect(text()).toContain('Courses to show');
    const boxes = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    expect([...boxes].map(b => b.checked)).toEqual([true, false]);
    await click(boxes[0]);
    expect(api.updateCanvasHiddenCourses).toHaveBeenCalledWith([1, 3]);
    expect(container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[0].checked).toBe(false);
  });

  it('keeps Test and the course choices disabled until every action started has finished', async () => {
    api.fetchCanvasConnection.mockResolvedValue(connected());
    api.fetchCanvasCourses.mockResolvedValue([{ id: 1, name: 'Operating Systems', course_code: 'CS 460' }]);
    let finishSave!: (c: CanvasConnection) => void;
    api.updateCanvasHiddenCourses.mockReturnValue(new Promise(resolve => { finishSave = resolve; }));
    await render();
    await click(container.querySelector<HTMLInputElement>('input[type="checkbox"]')!);
    expect(button('Test').disabled).toBe(true);
    await click(button('Test'));
    expect(api.testCanvasConnection).not.toHaveBeenCalled();
    await act(async () => finishSave(connected({ hidden_course_ids: [1] })));
    expect(button('Test').disabled).toBe(false);

    let finishTest!: (c: CanvasConnection) => void;
    api.testCanvasConnection.mockReturnValue(new Promise(resolve => { finishTest = resolve; }));
    await click(button('Test'));
    expect(container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.disabled).toBe(true);
    await act(async () => finishTest(connected({ hidden_course_ids: [1] })));
    expect(container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.disabled).toBe(false);
  });

  it('puts a course choice back when saving it fails', async () => {
    api.fetchCanvasConnection.mockResolvedValue(connected());
    api.fetchCanvasCourses.mockResolvedValue([{ id: 1, name: 'Operating Systems', course_code: 'CS 460' }]);
    api.updateCanvasHiddenCourses.mockRejectedValue(new Error('offline'));
    await render();
    const box = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    await click(box);
    expect(container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(true);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Couldn't save your course choices");
  });

  it('shows a friendly empty state when Canvas lists no courses', async () => {
    api.fetchCanvasConnection.mockResolvedValue(connected());
    api.fetchCanvasCourses.mockResolvedValue([]);
    await render();
    expect(text()).toContain("Canvas didn't list any active courses");
  });
});
