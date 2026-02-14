import { MatchMember, ChatMessage } from "@/types";

export const MOCK_MEMBERS: MatchMember[] = [
  {
    id: "user_2",
    nickname: "ゆうき",
    ageGroup: "27-28",
    job: "IT・エンジニア",
    avatarEmoji: "👨‍💻",
    bio: "大阪でWebエンジニアやってます！新しい出会い楽しみです",
  },
  {
    id: "user_3",
    nickname: "あやか",
    ageGroup: "24-26",
    job: "マーケティング",
    avatarEmoji: "👩‍💼",
    bio: "マーケ会社で働いてます。おしゃれなランチ大好き！",
  },
];

export const MOCK_RESTAURANTS = [
  { name: "GARB MONAQUE", area: "梅田" },
  { name: "北浜レトロ", area: "淀屋橋・本町" },
  { name: "道頓堀クラフトビア醸造所", area: "難波" },
  { name: "てんしば イーナ", area: "天王寺" },
];

export function generateMockChat(): ChatMessage[] {
  return [
    {
      id: "sys_1",
      senderId: "system",
      senderName: "システム",
      text: "マッチングが成立しました！3人でランチを楽しみましょう 🎉",
      timestamp: "12:00",
      isSystem: true,
    },
    {
      id: "msg_1",
      senderId: "user_2",
      senderName: "ゆうき",
      text: "はじめまして！マッチングありがとうございます！よろしくお願いします 😊",
      timestamp: "12:01",
    },
    {
      id: "msg_2",
      senderId: "user_3",
      senderName: "あやか",
      text: "よろしくお願いします！ランチ楽しみですね〜！",
      timestamp: "12:02",
    },
    {
      id: "msg_3",
      senderId: "user_2",
      senderName: "ゆうき",
      text: "集合場所はお店の前でいいですか？",
      timestamp: "12:05",
    },
    {
      id: "msg_4",
      senderId: "user_3",
      senderName: "あやか",
      text: "はい！お店の前で大丈夫です👌",
      timestamp: "12:06",
    },
  ];
}

export const AVATAR_EMOJIS = ["😊", "😎", "🤗", "😄", "🙂", "🤩", "😁", "🥳"];

export function getRandomEmoji(): string {
  return AVATAR_EMOJIS[Math.floor(Math.random() * AVATAR_EMOJIS.length)];
}
