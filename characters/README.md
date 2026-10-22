# The shelf

*Where the characters the players share live.*

Every file in this folder is a character, in the package format of the app.
The app reads this folder with no secret at all, so any character in it can
be brought into any app with one tap, in the settings, under The shelf.

To put a character here, drop its file in the folder and commit it. To keep
your own characters to yourself, open a branch: the app lists the branches
under the shelf, and a branch may hold a character of its own.

A character exported from the app is a package, and the file the app writes
is that package. The name of the file is the name of the character.

The shared characters live on `main`, one file per character. A branch is
for a character that is not ready to be shared yet, and the app lists the
branches under the shelf, so a player opens their own.

The app can write here too. Connect it to GitHub in the settings, under The
shelf, and the character being played goes onto the shelf with a tap, on the
branch named there. Two characters are here to start: the sorcerer of the app
and Yngwie the bard.

A character on the shelf has an address on GitHub, the one a browser shows
and the one a player copies. The app reads that address as well as the raw
one, so a character that lives on the shelf can be brought in from either.
The link that travels in a message is a different thing: the character rides
in the fragment of the link and no server ever sees it, so a link works
without the shelf and the shelf works without a link.
