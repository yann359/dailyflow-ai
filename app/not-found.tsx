import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="error-page">
      <h1>这个页面还不存在</h1>
      <Link href="/">回到轻律首页</Link>
    </main>
  );
}
