package com.newbornai.customsheet;

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

    private static final String ORIGIN = "https://sheet.local/";
    private static final int PICK = 41;
    private static final int VOID = 0xff08070f;

    private WebView view;
    private String pickedText = "";

    /* The words of the file the player picked. */
    public String pickedWords() {
        return pickedText;
    }

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
        view.addJavascriptInterface(new AssetBridge(this), "SheetShell");
        view.addJavascriptInterface(new FetchBridge(this), "SheetNet");

        setContentView(view);
        view.loadUrl(ORIGIN + "index.html");
    }

    /* The player picked a file: the page is told the name of it and asks for
       the words through the bridge. */
    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != PICK || result != RESULT_OK || data == null || data.getData() == null) return;
        try {
            InputStream in = getContentResolver().openInputStream(data.getData());
            if (in == null) return;
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] chunk = new byte[16384];
            int n;
            while ((n = in.read(chunk)) > 0) out.write(chunk, 0, n);
            in.close();
            pickedText = out.toString("UTF-8");
            view.evaluateJavascript("window.__sheetPicked && window.__sheetPicked('package.json')", null);
        } catch (Exception e) {
            pickedText = "";
        }
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

        private final MainActivity host;

        AssetBridge(MainActivity host) {
            this.host = host;
        }

        @JavascriptInterface
        public String read(String name) {
            if (name == null) return null;
            String path = name.replace("\\", "/");
            while (path.startsWith("/")) path = path.substring(1);
            path = path.replace("..", "");
            /* The assets are packed flat, because aapt2 on a windows machine
               writes a backslash into the name of an asset that sits in a
               folder, and the phone then looks for a name that is not there. */
            String flat = path;
            int slash = flat.lastIndexOf('/');
            if (slash >= 0) flat = flat.substring(slash + 1);
            String[] names = path.equals(flat) ? new String[] { path } : new String[] { path, flat };
            for (String candidate : names) {
                try {
                    InputStream in = host.getAssets().open(candidate);
                    ByteArrayOutputStream out = new ByteArrayOutputStream();
                    byte[] chunk = new byte[8192];
                    int n;
                    while ((n = in.read(chunk)) > 0) out.write(chunk, 0, n);
                    in.close();
                    return out.toString("UTF-8");
                } catch (IOException e) {
                    /* the next name */
                }
            }
            return null;
        }
    }

    /* Asks the machine that serves the app whether a newer build is there.
       The page cannot fetch it: the page is on its own origin and the
       answer comes from another one. */
    private static class FetchBridge {

        private final MainActivity host;

        FetchBridge(MainActivity host) {
            this.host = host;
        }

        /* The app updates itself: the build is fetched into the private
           storage of the app and the installer of the phone is handed it. */
        @JavascriptInterface
        public String download(String url) {
            if (url == null) return null;
            try {
                java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
                c.setConnectTimeout(5000);
                c.setReadTimeout(60000);
                c.setRequestMethod("GET");
                int code = c.getResponseCode();
                if (code < 200 || code > 299) {
                    c.disconnect();
                    return "error " + code;
                }
                java.io.File file = new java.io.File(host.getFilesDir(), "update.apk");
                java.io.FileOutputStream out = new java.io.FileOutputStream(file);
                InputStream in = c.getInputStream();
                byte[] chunk = new byte[16384];
                int n;
                while ((n = in.read(chunk)) > 0) out.write(chunk, 0, n);
                in.close();
                out.close();
                c.disconnect();
                return String.valueOf(file.length());
            } catch (Exception e) {
                return "error " + e.getClass().getSimpleName();
            }
        }

        /* Hands the downloaded build to the installer of the phone, which
           always asks the player before it puts anything in place. */
        @JavascriptInterface
        public String install() {
            try {
                java.io.File file = new java.io.File(host.getFilesDir(), "update.apk");
                if (!file.exists() || file.length() == 0) return "error nothing downloaded";
                Uri uri = ApkProvider.uriFor(host, "update.apk");
                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(uri, "application/vnd.android.package-archive");
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                host.startActivity(intent);
                return "ok";
            } catch (Exception e) {
                return "error " + e.getClass().getSimpleName();
            }
        }

        /* Opens the explorer of the phone, so a file can be picked. */
        @JavascriptInterface
        public String pick() {
            try {
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.setType("*/*");
                i.addCategory(Intent.CATEGORY_OPENABLE);
                host.startActivityForResult(i, PICK);
                return "picking";
            } catch (Exception e) {
                return "error " + e.getClass().getSimpleName();
            }
        }

        /* The words of the file that was picked. */
        @JavascriptInterface
        public String pickedText() {
            return host.pickedWords();
        }

        /* Writes a character out and offers it to the phone, so it can be
           sent to somebody. */
        @JavascriptInterface
        public String share(String name, String text) {
            try {
                java.io.File file = new java.io.File(host.getFilesDir(), name);
                java.io.FileOutputStream out = new java.io.FileOutputStream(file);
                out.write(text.getBytes("UTF-8"));
                out.close();
                Uri uri = ApkProvider.uriFor(host, name);
                Intent intent = new Intent(Intent.ACTION_SEND);
                intent.setType("application/json");
                intent.putExtra(Intent.EXTRA_STREAM, uri);
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                Intent chooser = Intent.createChooser(intent, "Send the character");
                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                host.startActivity(chooser);
                return "ok";
            } catch (Exception e) {
                return "error " + e.getClass().getSimpleName();
            }
        }

        /* Offers a piece of text to the phone, so a link can be sent to
           somebody. */
        @JavascriptInterface
        public String shareText(String text) {
            try {
                Intent intent = new Intent(Intent.ACTION_SEND);
                intent.setType("text/plain");
                intent.putExtra(Intent.EXTRA_TEXT, text);
                Intent chooser = Intent.createChooser(intent, "Send the link");
                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                host.startActivity(chooser);
                return "ok";
            } catch (Exception e) {
                return "error " + e.getClass().getSimpleName();
            }
        }

        /* Asks the repository something, with the token of the player. */
        /* A call to GitHub, in any method, with a token or without one.
           The answer comes back as a small envelope, so the page knows the
           status as well as the body: the sign in answers 200 while it waits,
           and the calls that write answer 201 when a file was made. */
        @JavascriptInterface
        public String request(String url, String method, String body, String token) {
            if (url == null) return null;
            try {
                java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
                c.setConnectTimeout(5000);
                c.setReadTimeout(20000);
                c.setRequestMethod(method == null ? "GET" : method);
                c.setRequestProperty("Accept", "application/json");
                if (token != null && token.length() > 0) c.setRequestProperty("Authorization", "Bearer " + token);
                if (body != null && body.length() > 0) {
                    c.setDoOutput(true);
                    c.setRequestProperty("Content-Type", "application/json");
                    java.io.OutputStream out = c.getOutputStream();
                    out.write(body.getBytes("UTF-8"));
                    out.close();
                }
                int code = c.getResponseCode();
                java.io.InputStream in = (code >= 200 && code <= 299) ? c.getInputStream() : c.getErrorStream();
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                if (in != null) {
                    byte[] chunk = new byte[8192];
                    int n;
                    while ((n = in.read(chunk)) > 0) out.write(chunk, 0, n);
                    in.close();
                }
                c.disconnect();
                String text = out.toString("UTF-8");
                StringBuilder env = new StringBuilder();
                env.append("{\"status\":").append(code).append(",\"body\":");
                org.json.JSONObject o = new org.json.JSONObject();
                o.put("status", code);
                o.put("body", text);
                return o.toString();
            } catch (Exception e) {
                return "error " + e.getClass().getSimpleName();
            }
        }

        @JavascriptInterface
        public String postUrl(String url, String body, String token) {
            if (url == null) return null;
            try {
                java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
                c.setConnectTimeout(5000);
                c.setReadTimeout(15000);
                c.setRequestMethod("POST");
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "application/json");
                if (token != null && token.length() > 0) c.setRequestProperty("Authorization", "Bearer " + token);
                if (body != null) {
                    java.io.OutputStream out = c.getOutputStream();
                    out.write(body.getBytes("UTF-8"));
                    out.close();
                }
                int code = c.getResponseCode();
                java.io.InputStream in = (code >= 200 && code <= 299) ? c.getInputStream() : c.getErrorStream();
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                if (in != null) {
                    byte[] chunk = new byte[8192];
                    int n;
                    while ((n = in.read(chunk)) > 0) out.write(chunk, 0, n);
                    in.close();
                }
                c.disconnect();
                return out.toString("UTF-8");
            } catch (Exception e) {
                return "error " + e.getClass().getSimpleName();
            }
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

        private final MainActivity host;

        ShellClient(MainActivity host) {
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
            String flat = path;
            int slash = flat.lastIndexOf('/');
            if (slash >= 0) flat = flat.substring(slash + 1);
            String[] names = path.equals(flat) ? new String[] { path } : new String[] { path, flat };
            for (String candidate : names) {
                try {
                    InputStream in = host.getAssets().open(candidate);
                    return new WebResourceResponse(mimeOf(candidate), "utf-8", in);
                } catch (IOException e) {
                    /* the next name */
                }
            }
            byte[] none = new byte[0];
            return new WebResourceResponse("text/plain", "utf-8", new ByteArrayInputStream(none));
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
