export const allowedOrigins = (process.env.ALLOWED_ORIGINS?.split(',') || []).map(origin => {
    if (origin.startsWith('regex:')) {
        // Convert the regex string to a RegExp object
        const regexPattern = origin.replace('regex:', '');
        return new RegExp(regexPattern);
    }
    // Return the origin as is if it's not a regex
    return origin;
});