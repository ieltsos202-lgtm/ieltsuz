export interface MockEntry {
  id: string;
  title: string;
  slug: string;
  url: string;
}

const LISTENING_COUNT = 35;
const READING_COUNT = 35;

function buildList(prefix: "L" | "R", count: number, label: string): MockEntry[] {
  return Array.from({ length: count }, (_, i) => {
    const num = i + 1;
    const id = `${prefix}${num}`;
    return {
      id,
      title: `${label} Test ${num}`,
      slug: id,
      url: `/mocks/${id}.html`,
    };
  });
}

export const LISTENING_MOCKS: MockEntry[] = buildList("L", LISTENING_COUNT, "Listening");
export const READING_MOCKS: MockEntry[] = buildList("R", READING_COUNT, "Reading");
