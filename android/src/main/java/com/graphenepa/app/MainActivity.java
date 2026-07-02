package com.graphenepa.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

public class MainActivity extends AppCompatActivity {

    private WebView webView;
    private SmsProvider smsProvider;
    private static final String LOCAL_SERVER = "http://localhost:3000";
    private static final int SMS_PERMISSION_CODE = 100;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        // Request SMS permission if not granted
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_SMS)
                    != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this,
                        new String[]{Manifest.permission.READ_SMS},
                        SMS_PERMISSION_CODE);
            }
        }

        // Handle edge-to-edge display (safe areas for notches)
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.main), (v, insets) -> {
            int top = insets.getInsets(WindowInsetsCompat.Type.systemBars()).top;
            int bottom = insets.getInsets(WindowInsetsCompat.Type.systemBars()).bottom;
            int left = insets.getInsets(WindowInsetsCompat.Type.systemBars()).left;
            int right = insets.getInsets(WindowInsetsCompat.Type.systemBars()).right;

            v.setPadding(left, top, right, bottom);
            return insets;
        });

        webView = findViewById(R.id.webview);
        smsProvider = new SmsProvider(this);
        setupWebView();
        loadApp();
    }

    private void setupWebView() {
        WebSettings settings = webView.getSettings();

        // Security settings
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setGeolocationEnabled(false);

        // Performance settings
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        // Display settings
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            settings.setAlgorithmicDarkeningAllowed(true);
        }

        // User agent for identification
        settings.setUserAgentString(settings.getUserAgentString() + " GraphenePA/1.0");

        // Viewport meta tag support
        settings.setViewportWidth(390);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                // Only allow localhost and https
                if (url.startsWith("http://localhost") || url.startsWith("https://")) {
                    return false;
                }
                // Block other URLs
                return true;
            }
        });

        // Add JavaScript interface for native SMS access
        webView.addJavascriptInterface(new SmsInterface(), "androidSms");
    }

    private class SmsInterface {
        @JavascriptInterface
        public String getSms() {
            return smsProvider.getSmsMessages();
        }

        @JavascriptInterface
        public void syncSms(String email) {
            smsProvider.syncSmsWithBackend(email, LOCAL_SERVER);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == SMS_PERMISSION_CODE) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                // Permission granted, SMS access is now available
            }
        }
    }

    private void loadApp() {
        webView.loadUrl(LOCAL_SERVER);
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
