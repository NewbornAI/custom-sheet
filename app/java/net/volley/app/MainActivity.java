package net.volley.app;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;

/**
 * The page and the data travel in the assets. This shell gives them a window,
 * a dark background, a storage area for the saved state, and a local origin:
 * a page cannot read a file next to it, so the shell answers for the assets
 * itself. The library of spells and features is read when the app asks for
 * it, so a launch only pays for the character being played.
 */
public class MainActivity extends Activity {

    private static final String ORIGIN = "https://dnd.local/";
    private static final int VOID = 0xff08070f;

    private WebView view;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().setStatusBarColor(VOID);
        getWindow().setNavigationBarColor(VOID);

        view = new WebView(this);
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setTextZoom(100);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);

        view.setBackgroundColor(VOID);
        view.setOverScrollMode(View.OVER_SCROLL_NEVER);
        view.setVerticalScrollBarEnabled(false);
        view.setHorizontalScrollBarEnabled(false);
        view.setWebViewClient(new ShellClient(this));
        /* The page asks the shell for a file that sits in the assets: a page
           cannot read one by itself, and the network is not there to fetch
           it. */
        view.addJavascriptInterface(new AssetBridge(this), "DndShell");
        view.addJavascriptInterface(new FetchBridge(this), "DndNet");

        setContentView(view);
        view.loadUrl(ORIGIN + "index.html");
    }

    @Override
    public void onBackPressed() {
        if (view != null && view.canGoBack()) {
            view.goBack();
        } else {
            super.onBackPressed();
        }
    }

    /* Reads a file out of the assets for the page. */
    private static class AssetBridge {

        private final Activity host;

        AssetBridge(Activity host) {
            this.host = host;
        }

        @JavascriptInterface
        public String read(String name) {
            if (name == null) return null;
            String path = name.replace("\\", "/");
            while (path.startsWith("/")) path = path.substring(1);
            path = path.replace("..", "");
            try {
                InputStream in = host.getAssets().open(path);
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] chunk = new byte[8192];
                int n;
                while ((n = in.read(chunk)) > 0) out.write(chunk, 0, n);
                in.close();
                return out.toString("UTF-8");
            } catch (IOException e) {
                return null;
            }
        }
    }

    /* Asks the machine that serves the app whether a newer build is there.
       The page cannot fetch it: the page is on its own origin and the
       answer comes from another one. */
    private static class FetchBridge {

        private final Activity host;

        FetchBridge(Activity host) {
            this.host = host;
        }

        @JavascriptInterface
        public String fetchUrl(String url) {
            if (url == null) return null;
            try {
                java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
                c.setConnectTimeout(4000);
                c.setReadTimeout(8000);
                c.setRequestMethod("GET");
                int code = c.getResponseCode();
                if (code < 200 || code > 299) {
                    c.disconnect();
                    return "error " + code;
                }
                InputStream in = c.getInputStream();
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] chunk = new byte[8192];
                int n;
                while ((n = in.read(chunk)) > 0) out.write(chunk, 0, n);
                in.close();
                c.disconnect();
                return out.toString("UTF-8");
            } catch (Exception e) {
                return "error " + e.getClass().getSimpleName();
            }
        }
    }

    /* Serves the assets from the local origin, and sends a link to the web
       out of the app. */
    private static class ShellClient extends WebViewClient {

        private final Activity host;

        ShellClient(Activity host) {
            this.host = host;
        }

        private static String mimeOf(String path) {
            if (path.endsWith(".html")) return "text/html";
            if (path.endsWith(".json")) return "application/json";
            if (path.endsWith(".js")) return "text/javascript";
            if (path.endsWith(".css")) return "text/css";
            if (path.endsWith(".svg")) return "image/svg+xml";
            if (path.endsWith(".png")) return "image/png";
            if (path.endsWith(".woff2")) return "font/woff2";
            return "application/octet-stream";
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (uri == null) return null;
            String where = uri.getScheme() + "://" + uri.getHost();
            if (!ORIGIN.startsWith(where)) return null;
            String path = uri.getPath();
            if (path == null || path.equals("/") || path.isEmpty()) path = "/index.html";
            while (path.startsWith("/")) path = path.substring(1);
            path = path.replace("..", "");
            try {
                InputStream in = host.getAssets().open(path);
                return new WebResourceResponse(mimeOf(path), "utf-8", in);
            } catch (IOException e) {
                byte[] none = new byte[0];
                return new WebResourceResponse("text/plain", "utf-8", new ByteArrayInputStream(none));
            }
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (uri == null) return false;
            if (ORIGIN.startsWith(uri.getScheme() + "://" + uri.getHost())) return false;
            try {
                host.startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (Exception e) {
                return true;
            }
            return true;
        }
    }
}
