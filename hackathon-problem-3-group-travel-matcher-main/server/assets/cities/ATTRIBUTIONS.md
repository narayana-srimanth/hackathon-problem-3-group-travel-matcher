# City photo credits

These photos are not part of the data pack. The backend serves them at `GET /static/cities/<file>.jpg`, and `GET /api/v1/meta/destinations` returns the path as `cities[].image`.

All photos come from Wikimedia Commons, resized to 1280 px wide. No other changes.

| File | City | Source | Author | License |
|---|---|---|---|---|
| `tokyo.jpg` | Tokyo | [Skyscrapers of Shinjuku 2009 January.jpg](https://commons.wikimedia.org/wiki/File:Skyscrapers_of_Shinjuku_2009_January.jpg) | Morio | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0) |
| `kyoto.jpg` | Kyoto | [Kiyomizu-dera in Kyoto.jpg](https://commons.wikimedia.org/wiki/File:Kiyomizu-dera_in_Kyoto.jpg) | New Japan | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0) |
| `osaka.jpg` | Osaka | [Osaka Castle 02bs3200.jpg](https://commons.wikimedia.org/wiki/File:Osaka_Castle_02bs3200.jpg) | 663highland | [CC BY 2.5](https://creativecommons.org/licenses/by/2.5) |
| `dubai.jpg` | Dubai | [Dubai Skyline mit Burj Khalifa (18241030269).jpg](https://commons.wikimedia.org/wiki/File:Dubai_Skyline_mit_Burj_Khalifa_(18241030269).jpg) | Tim Reckmann | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0) |
| `abu-dhabi.jpg` | Abu Dhabi | [Sheikh Zayed Grand Mosque @ Abu Dhabi (15856602738).jpg](https://commons.wikimedia.org/wiki/File:Sheikh_Zayed_Grand_Mosque_@_Abu_Dhabi_(15856602738).jpg) | Guilhem Vellut | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0) |

To add a city photo, drop `<city-slug>.jpg` here (lowercase, spaces → `-`, e.g. `abu-dhabi.jpg`) and add a row above. No code change is needed.
