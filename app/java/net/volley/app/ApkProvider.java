package net.volley.app;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;

import java.io.File;
import java.io.FileNotFoundException;

/**
 * Serves the downloaded build to the installer of the phone, which cannot
 * read a file of its own. The file stays in the private storage of the app
 * and the installer is given the right to read that one address.
 */
public class ApkProvider extends ContentProvider {

    public static final String AUTHORITY = "net.volley.app.apk";

    public static Uri uriFor(Context context) {
        return new Uri.Builder().scheme("content").authority(AUTHORITY).path("update.apk").build();
    }

    @Override
    public boolean onCreate() {
        return true;
    }

    @Override
    public String getType(Uri uri) {
        return "application/vnd.android.package-archive";
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        File file = new File(getContext().getFilesDir(), "update.apk");
        MatrixCursor cursor = new MatrixCursor(new String[] { "_display_name", "_size" });
        cursor.addRow(new Object[] { "update.apk", file.length() });
        return cursor;
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        return null;
    }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) {
        return 0;
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
        return 0;
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        File file = new File(getContext().getFilesDir(), "update.apk");
        return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
    }
}
