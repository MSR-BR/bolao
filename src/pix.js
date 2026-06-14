function normalizeText(value, maxLength) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 $%*+\-./:]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function emv(id, value) {
  const text = String(value);
  return `${id}${String(text.length).padStart(2, "0")}${text}`;
}

function crc16(payload) {
  let crc = 0xffff;

  for (let index = 0; index < payload.length; index += 1) {
    crc ^= payload.charCodeAt(index) << 8;

    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function buildPixPayload({
  pixKey,
  amount,
  merchantName = "BOLAO PIX",
  merchantCity = "SAO PAULO",
  description,
  txid,
}) {
  const cleanKey = String(pixKey || "").trim();
  const cleanAmount = Number(amount || 0);

  if (!cleanKey) {
    return "";
  }

  const merchantAccount = [
    emv("00", "br.gov.bcb.pix"),
    emv("01", cleanKey),
    description ? emv("02", normalizeText(description, 70)) : "",
  ].join("");

  const additionalData = emv("05", normalizeText(txid || "BOLAO", 25) || "BOLAO");
  const withoutCrc = [
    emv("00", "01"),
    emv("26", merchantAccount),
    emv("52", "0000"),
    emv("53", "986"),
    cleanAmount > 0 ? emv("54", cleanAmount.toFixed(2)) : "",
    emv("58", "BR"),
    emv("59", normalizeText(merchantName, 25) || "BOLAO PIX"),
    emv("60", normalizeText(merchantCity, 15) || "SAO PAULO"),
    emv("62", additionalData),
    "6304",
  ].join("");

  return `${withoutCrc}${crc16(withoutCrc)}`;
}

export function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value || 0));
}

