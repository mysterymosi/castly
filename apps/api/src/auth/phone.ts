export class InvalidPhone extends Error {
  constructor() {
    super("Enter a Nigerian mobile number.")
    this.name = "InvalidPhone"
  }
}

/**
 * Nigerian mobiles become E.164. Accepts 080…, 234…, and +234….
 * The national number is 10 digits and starts with 7, 8, or 9.
 */
export function toNigerianE164(input: string) {
  let digits = input.replace(/[^\d]/g, "")
  if (digits.startsWith("234")) digits = digits.slice(3)
  else if (digits.startsWith("0")) digits = digits.slice(1)
  if (!/^[789]\d{9}$/.test(digits)) throw new InvalidPhone()
  return `+234${digits}`
}
