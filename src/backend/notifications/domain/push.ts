export interface AbonnementPush {
  id: string;
  userId: string;
  role: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface MessagePush {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  roles?: string[];
}
