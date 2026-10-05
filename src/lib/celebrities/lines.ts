/**
 * The Compliment's words. Every line flatters the Visitor, names exactly one Celebrity
 * through {name}, never quotes a number, never ranks the Visitor below anyone, and never says
 * the Visitor looks like anyone: TheFace compares a number, it does not judge resemblance.
 * `lines.test.ts` enforces each rule.
 */

export const COMPLIMENT_TIERS = ["top", "above", "league"] as const;
/** top: beats the whole pool. above: beats some of it. league: beats none, still a compliment. */
export type ComplimentTier = (typeof COMPLIMENT_TIERS)[number];

export const COMPLIMENT_LANGS = ["en", "vi"] as const;
export type ComplimentLang = (typeof COMPLIMENT_LANGS)[number];

export const NAME_SLOT = "{name}";

export const LINES: {
  readonly [L in ComplimentLang]: { readonly [T in ComplimentTier]: readonly string[] };
} = {
  en: {
    top: [
      "Top 5 in the world, easily. Sorry, {name}.",
      "{name} just got bumped down a spot.",
      "Somebody tell {name} there's a new face at the top.",
      "Move over, {name}. The crown fits you better.",
    ],
    above: [
      "More beautiful than {name}. Not even close.",
      "{name} called. They want your skincare routine.",
      "Prettier than {name}, and that's on the record.",
      "If {name} saw this, they'd ask for your secret.",
    ],
    league: [
      "Same league as {name}.",
      "You and {name}: same tier, different zip code.",
      "Put you next to {name} and nobody would complain.",
      "Officially in {name}'s league. Act accordingly.",
    ],
  },
  vi: {
    top: [
      "Top 5 thế giới là có thật, xin lỗi {name} nha!",
      "Hôm nay {name} phải xếp hàng sau bạn rồi.",
      "Ai báo {name} giùm, ngôi vương đổi chủ rồi!",
      "Nhan sắc này thì {name} cũng phải dè chừng.",
    ],
    above: [
      "Đẹp hơn {name} luôn rồi, không phải bàn!",
      "{name} mà thấy chắc cũng phải xin bí quyết.",
      "Visual này vượt mặt {name} rồi nha.",
      "Đứng cạnh bạn, {name} cũng phải lép vế.",
    ],
    league: [
      "Ngang ngửa {name} luôn, ra đường cẩn thận bị xin chữ ký!",
      "Cùng đẳng cấp nhan sắc với {name} đó nha.",
      "Bạn với {name} chung một mâm rồi đó.",
      "Đặt cạnh {name} chẳng ai chê được đâu.",
    ],
  },
};
