export async function preparePhoto(
  file: File,
  maxWidth = 1000,
): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error('请选择 JPG、PNG 或 WebP 图片');
  if (file.size > 10 * 1024 * 1024) throw new Error('图片不能超过10MB');
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('图片无法读取，请换一张有效的 JPG、PNG 或 WebP 图片');
  });
  const ratio = Math.min(1, maxWidth / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
  canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('浏览器无法处理图片');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const value = canvas.toDataURL('image/jpeg', 0.8);
  if (value.length > 2000000) throw new Error('图片太大，请选择较小图片');
  return value;
}
