export const AVATAR_EMOJIS = [
  "🧑‍💼", "👩‍💼", "🧑‍💻", "👩‍💻", "🧑‍🍳", "👩‍🍳",
  "🧑‍🎨", "👩‍🎨", "🧑‍🔬", "👩‍🔬", "🧑‍🏫", "👩‍🏫",
  "🧑‍⚕️", "👩‍⚕️", "👨‍✈️", "👩‍✈️",
];

export function getRandomEmoji(): string {
  return AVATAR_EMOJIS[Math.floor(Math.random() * AVATAR_EMOJIS.length)];
}
