/**
 * 将 Git 远程地址转换为浏览器可访问的 URL
 */
export function convertGitUrlToBrowserUrl(gitUrl: string): string | null {
    if (!gitUrl) {
        return null;
    }

    // 处理 SSH 格式: git@github.com:username/repo.git
    if (gitUrl.startsWith('git@')) {
        const match = gitUrl.match(/git@([^:]+):(.+)\.git$/);
        if (match) {
            const [, host, path] = match;
            if (host.includes('github.com')) {
                return `https://github.com/${path}`;
            } else if (host.includes('gitlab.com')) {
                return `https://gitlab.com/${path}`;
            } else if (host.includes('bitbucket.org')) {
                return `https://bitbucket.org/${path}`;
            } else if (host.includes('gitee.com')) {
                return `https://gitee.com/${path}`;
            }
            return `https://${host}/${path}`;
        }
    }

    // 处理 HTTPS/HTTP 格式: https://github.com/username/repo.git
    if (gitUrl.startsWith('http://') || gitUrl.startsWith('https://')) {
        return gitUrl.replace(/\.git$/, '');
    }

    return null;
}

