# Mock ID photos

The built-in photos on the Training Library's adult clients' mock IDs (`client-id.js`). Each file is `<name>-<birth year>.jpg`, one per person, so a client who is in several files has the same photo in each.

**They are synthetic: the faces are AI-generated and show no real person.** They come from the *Synthetic Faces High Quality* (SFHQ) dataset by David Beniaguev (<https://github.com/SelfishGene/SFHQ-dataset>), released as CC0 1.0 (public domain; no attribution required, given here anyway). The 256 px versions were taken from the Hugging Face copy `pravsels/SFHQ_256` (shards 12, 33, 51, 64, 70 and 80) and used as they are.

**Order on a mock ID:** the realistic photo an Admin made (`library-photos.js`) comes first, then the photo here, then the drawn portrait (`case-photos.js`). **A minor has no photo here**: a minor's mock ID keeps the drawn portrait.

Who got which face was decided by the age on the client's file and by whether the file refers to the client as he or she (the notes, calls and summary). Where a file didn't say, the choice was made from the first name; change any of them by replacing its file. A synthetic face can still resemble a real person by chance; if one ever does, replace its file.

To add one: put a 256 px (or larger) square JPG here as `<name>-<birth year>.jpg` (lower case, accents and punctuation turned into `-`) and add that name to `ID_PHOTOS` in `client-id.js`.

| File | Source image (SFHQ) |
|---|---|
| `marcus-lee-2000.jpg` | `SFHQ_pt4_00004097.jpg` |
| `schuyler-beauchamp-2000.jpg` | `SFHQ_pt4_00007470.jpg` |
| `jose-hernandez-1994.jpg` | `SFHQ_pt4_00004084.jpg` |
| `andre-coleman-1991.jpg` | `SFHQ_pt4_00000882.jpg` |
| `rhys-beaumont-1991.jpg` | `SFHQ_pt4_00002455.jpg` |
| `bjorn-courthope-1988.jpg` | `SFHQ_pt4_00006169.jpg` |
| `ahmed-rahman-1985.jpg` | `SFHQ_pt4_00006953.jpg` |
| `james-wilson-1983.jpg` | `SFHQ_pt4_00005443.jpg` |
| `carlos-mendoza-1977.jpg` | `SFHQ_pt4_00001405.jpg` |
| `derek-thompson-1975.jpg` | `SFHQ_pt4_00002547.jpg` |
| `brian-o-neill-1972.jpg` | `SFHQ_pt4_00001308.jpg` |
| `samuel-boateng-1970.jpg` | `SFHQ_pt4_00005084.jpg` |
| `cian-masserene-1970.jpg` | `SFHQ_pt4_00006209.jpg` |
| `robert-chen-1969.jpg` | `SFHQ_pt4_00002725.jpg` |
| `walter-grant-1968.jpg` | `SFHQ_pt4_00002326.jpg` |
| `tomas-rivera-1964.jpg` | `SFHQ_pt4_00004889.jpg` |
| `jose-hernandez-1962.jpg` | `SFHQ_pt4_00004564.jpg` |
| `william-harris-1958.jpg` | `SFHQ_pt4_00000221.jpg` |
| `james-wilson-1956.jpg` | `SFHQ_pt4_00005419.jpg` |
| `george-hammond-1949.jpg` | `SFHQ_pt4_00002410.jpg` |
| `harold-jenkins-1948.jpg` | `SFHQ_pt4_00003551.jpg` |
| `keisha-brown-1995.jpg` | `SFHQ_pt4_00004404.jpg` |
| `brittany-kirkcudbright-1996.jpg` | `SFHQ_pt4_00000702.jpg` |
| `niamh-cholmondeley-1998.jpg` | `SFHQ_pt4_00003894.jpg` |
| `mireille-featherstonhaugh-1994.jpg` | `SFHQ_pt4_00002949.jpg` |
| `olivia-bennett-1993.jpg` | `SFHQ_pt4_00005699.jpg` |
| `aisha-patel-1992.jpg` | `SFHQ_pt4_00000990.jpg` |
| `emily-nguyen-1990.jpg` | `SFHQ_pt4_00001163.jpg` |
| `tanya-reed-1990.jpg` | `SFHQ_pt4_00002959.jpg` |
| `maria-santos-1988.jpg` | `SFHQ_pt4_00000959.jpg` |
| `latoya-jackson-1987.jpg` | `SFHQ_pt4_00002286.jpg` |
| `hannah-pierce-1987.jpg` | `SFHQ_pt4_00000953.jpg` |
| `rachel-donovan-1986.jpg` | `SFHQ_pt4_00005512.jpg` |
| `nicole-adams-1984.jpg` | `SFHQ_pt4_00001658.jpg` |
| `denise-carter-1981.jpg` | `SFHQ_pt4_00002753.jpg` |
| `ngozi-okonkwo-1979.jpg` | `SFHQ_pt4_00001452.jpg` |
| `maria-santos-1971.jpg` | `SFHQ_pt4_00006941.jpg` |
| `siobhan-masserene-1968.jpg` | `SFHQ_pt4_00003307.jpg` |
| `linda-garcia-1961.jpg` | `SFHQ_pt4_00003542.jpg` |
| `saoirse-shaughnessy-1955.jpg` | `SFHQ_pt4_00002514.jpg` |
| `patricia-lewis-1946.jpg` | `SFHQ_pt4_00001827.jpg` |
