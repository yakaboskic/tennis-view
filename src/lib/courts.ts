export type Sport = 'tennis' | 'squash';

export interface Court {
  id: string;
  name: string;
}

export const SPORTS_CONFIG: Record<Sport, { name: string; courts: Court[] }> = {
  tennis: {
    name: 'Tennis',
    courts: [
      { id: '3b92dfe2-3eb0-4860-b07f-f058e0e18019', name: 'Court 1' },
      { id: '58d5f7ab-8c69-41e7-bc50-a1ccbe58459a', name: 'Court 2' },
      { id: '02868885-c471-42d4-a03d-9e3cbe889bed', name: 'Court 3' },
      { id: '1b4679e7-5fa4-4b05-a16c-4dc892974716', name: 'Court 4' },
      { id: '442d6bde-6c26-46cd-bec8-9e1d7047e7b9', name: 'Court 5' },
      { id: 'e11bd3c1-4e58-4b8d-98c7-9fbc1838216e', name: 'Court 6 (1.5 Hours)' },
    ],
  },
  squash: {
    name: 'Squash',
    courts: [
      { id: '2e05bf1d-aa72-42c7-8f38-0619503add42', name: 'Court 12' },
      { id: '79af72b2-fa7c-45a0-af13-ba38ddac2903', name: 'Court 13' },
      { id: 'ecfb57a5-0dcf-4f63-97ef-e9e2a017347f', name: 'Court 14' },
    ],
  },
};

export function getReservationUrl(courtId: string): string {
  return `https://membership.gocrimson.com/Program/GetProgramDetails?courseId=${courtId}`;
}
