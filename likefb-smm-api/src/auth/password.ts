import bcrypt from 'bcryptjs'

function pepper() {
  return process.env.PASSWORD_PEPPER || ''
}

export async function hashPassword(password: string) {
  const saltRounds = 12
  return await bcrypt.hash(password + pepper(), saltRounds)
}

export async function verifyPassword(password: string, passwordHash: string) {
  return await bcrypt.compare(password + pepper(), passwordHash)
}

