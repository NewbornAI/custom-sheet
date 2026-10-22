package net.volley.app;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;

/**
 * The whole app is one page loaded from the assets, so this shell only has to
 * give it a window, a dark background and a storage area for the saved state.
 */
public class MainActivity extends Activity {

    private static final String PAGE = "file:///android_asset/index.html";
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
        /* The page is local, so a link to the web opens in the browser of
           the phone and the app stays where it is. */
        view.setWebViewClient(new LinkClient(this));

        setContentView(view);
        view.loadUrl(PAGE);
    }

    @Override
    public void onBackPressed() {
        if (view != null && view.canGoBack()) {
            view.goBack();
        } else {
            super.onBackPressed();
        }
    }

    /* Sends the links to the web out of the app. */
    private static class LinkClient extends WebViewClient {

        private final Activity host;

        LinkClient(Activity host) {
            this.host = host;
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (uri == null) return false;
            String scheme = uri.getScheme();
            if (scheme == null || "file".equals(scheme)) return false;
            try {
                host.startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (Exception e) {
                return true;
            }
            return true;
        }
    }
}
