import Link from "next/link";
import {
  SiX as XIcon,
  SiGithub as GithubIcon,
  SiFacebook as FacebookIcon,
} from "@icons-pack/react-simple-icons";
import { Mail } from "lucide-react";
import ThemeSwitch from "@/components/theme-switch";
import { GITHUB_REPO_URL, SITE_NAME } from "@/constants";
import { Button } from "./ui/button";
import AgenticDevStudioLogo from "./agenticdev-studio-logo";
import { getGithubStars } from "@/utils/stats";
import { Suspense } from "react";

/** 你自己的链接：保持竖排；超出 5 个时会显示“More”展开全部 */
const LINKS: { label: string; href: string }[] = [
  { label: "Docs", href: "/docs" },
  { label: "Blog", href: "/blog" },
  { label: "Changelog", href: "/changelog" },
  { label: "Status", href: "/status" },
  { label: "Support", href: "/support" },
  // 超过 5 个会被折叠到“More”里
  { label: "Careers", href: "/careers" },
  { label: "Community", href: "/community" },
];

export function Footer() {
  const firstFive = LINKS.slice(0, 5);
  const rest = LINKS.slice(5);

  return (
    <footer className="border-t dark:bg-muted/30 bg-muted/60 shadow">
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
        <div className="py-6 md:py-8">
          {/* 五个板块同一行：大屏 5 列；小屏自动换行 */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-8 md:gap-6">
            {/* Legal */}
            <div className="space-y-3 md:space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Legal</h3>
              <ul className="space-y-2">
                <li>
                  <Link
                    href="/terms"
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <Link
                    href="/privacy"
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    Privacy Policy
                  </Link>
                </li>
              </ul>
            </div>

            {/* Company */}
            <div className="space-y-3 md:space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Company</h3>
              <ul className="space-y-2">
                <li>
                  <Link
                    href="/"
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    Home
                  </Link>
                </li>
                {/* 需要可继续加 */}
              </ul>
            </div>

            {/* Social */}
            <div className="space-y-3 md:space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Social</h3>
              <div className="flex items-center space-x-4">
                <a
                  href="https://x.com/planvaofficial"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="X (formerly Twitter)"
                >
                  <XIcon className="h-5 w-5" />
                </a>
                
              </div>
            </div>

            {/* 链接（竖排 & More 展开） */}
            <div className="space-y-3 md:space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Links</h3>
              <ul className="space-y-2">
                {firstFive.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="text-sm text-muted-foreground hover:text-foreground"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
              {rest.length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                    More
                  </summary>
                  <ul className="mt-2 space-y-2 pl-4">
                    {rest.map((l) => (
                      <li key={l.href}>
                        <Link
                          href={l.href}
                          className="text-sm text-muted-foreground hover:text-foreground"
                        >
                          {l.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>

            {/* 联系我们（邮箱） */}
            <div className="space-y-3 md:space-y-4">
              <h3 className="text-sm font-semibold text-foreground">
                Contact
              </h3>
              <div className="flex items-center gap-3">
                <a
                  href="mailto:support@abc.com"
                  className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                >
                  <Mail className="h-5 w-5" />
                  support@abc.com
                </a>
              </div>
            </div>
          </div>

          {/* Copyright + 右侧主题/GitHub 按钮（保留你原逻辑） */}
          <div className="mt-6 pt-6 md:mt-8 md:pt-8 border-t">
            <div className="flex flex-col items-center gap-6 md:flex-row md:justify-between md:gap-4">
              <p className="text-sm text-muted-foreground text-center md:text-left">
                © {new Date().getFullYear()} {SITE_NAME}. All rights reserved.
              </p>

              <div className="flex flex-col md:flex-row items-center gap-4 md:space-x-4">
                {GITHUB_REPO_URL && (
                  <Suspense fallback={<GithubButtonFallback />}>
                    <GithubButton />
                  </Suspense>
                )}
                <div className="flex items-center gap-4">
                  <ThemeSwitch />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

/** ====== 你原来就有的 Github 按钮（保留） ====== */
async function GithubButton() {
  const stars = await getGithubStars();
  return (
    <Button asChild variant="outline" className="gap-2">
      <a
        href={GITHUB_REPO_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="GitHub Repository"
      >
        <GithubIcon className="h-4 w-4" />
        <span>Star on GitHub</span>
        {typeof stars === "number" && (
          <span className="ml-1 text-muted-foreground">({stars.toLocaleString()})</span>
        )}
      </a>
    </Button>
  );
}

function GithubButtonFallback() {
  return (
    <Button asChild variant="outline" className="gap-2">
      <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">
        <GithubIcon className="h-4 w-4" />
        <span>GitHub</span>
      </a>
    </Button>
  );
}
