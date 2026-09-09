/** vinext-starter 模板的 Cloudflare Worker 请求入口。 */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// 图片安全配置：扩展名为 .svg 的图片会在客户端自动跳过优化接口，直接加载原图。
// 如需通过图片优化器处理 SVG 并附加安全响应头，请在 next.config.ts 中设置
// dangerouslyAllowSVG: true，并取消下方配置的注释：
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    const response = await handler.fetch(request, env, ctx);
    if (url.pathname === "/display" && url.searchParams.get("tvapp") === "1") {
      return makeLegacyTvResponse(response);
    }
    return response;
  },
};

const navigationRuntimeExpression =
  '((self[Symbol.for("vinext.navigationRuntime")]??={bootstrap:{routeManifest:null},functions:{}}).bootstrap.rsc??={rsc:[]})';
const legacyNavigationRuntimeExpression =
  '(function(){var s=Symbol.for("vinext.navigationRuntime");var n=self[s];if(n==null)n=self[s]={bootstrap:{routeManifest:null},functions:{}};if(n.bootstrap.rsc==null)n.bootstrap.rsc={rsc:[]};return n.bootstrap.rsc})()';

async function makeLegacyTvResponse(response: Response) {
  if (!response.headers.get("content-type")?.toLowerCase().includes("text/html")) return response;
  const html = (await response.text()).split(navigationRuntimeExpression).join(legacyNavigationRuntimeExpression);
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("cache-control", "no-store, no-cache, must-revalidate");
  return new Response(html, { status: response.status, statusText: response.statusText, headers });
}

export default worker;
