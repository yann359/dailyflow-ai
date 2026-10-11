'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="error-page">
      <h1>暂时没有打开成功</h1>
      <p>本地记录仍在浏览器中，请重新尝试。</p>
      <button onClick={reset}>重新加载</button>
    </main>
  );
}
