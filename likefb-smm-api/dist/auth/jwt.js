import * as jwt from 'jsonwebtoken';
export function signAccessToken(user) {
    const secret = process.env.JWT_SECRET;
    if (!secret)
        throw new Error('JWT_SECRET is missing');
    const expiresIn = (process.env.JWT_EXPIRES_IN || '7d');
    const options = { subject: user.sub, expiresIn };
    return jwt.sign({ email: user.email }, secret, options);
}
export function verifyAccessToken(token) {
    const secret = process.env.JWT_SECRET;
    if (!secret)
        throw new Error('JWT_SECRET is missing');
    const payload = jwt.verify(token, secret);
    const sub = payload.sub;
    const email = payload.email;
    if (typeof sub !== 'string' || typeof email !== 'string') {
        throw new Error('Invalid token payload');
    }
    return { sub, email };
}
