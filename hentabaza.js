(function () {
    'use strict';

    if (window.plugin_hentabaza_ready) return;
    window.plugin_hentabaza_ready = true;

    var API = 'https://hentaibaza.com/api';
    var SITE = 'https://hentaibaza.com';
    var HENTASIS = 'https://hentasis1.top';
    var HENTAI_MAMA = 'https://hentaimama.io';
    var HENTASIS_PROXY = 'https://api.allorigins.win/raw?url=';
    var HENTASIS_READER = 'https://proxy.cors.dev/';
    var HENTAI_MAMA_READER = 'https://r.jina.ai/';
    var HENTAI_MAMA_POST_PROXY = 'https://corsproxy.io/?url=';

    function safeText(value) {
        return String(value || '').replace(/[&<>"']/g, function (char) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
        });
    }

    function request(url, success, failure, postData) {
        var candidates = [url];
        var isJson = url.indexOf(API + '/') === 0;

        if (!postData && url.indexOf(HENTASIS) === 0) {
            candidates.push(HENTASIS_READER + url, HENTASIS_PROXY + encodeURIComponent(url));
        }
        else if (!postData && url.indexOf(HENTAI_MAMA) === 0) {
            // Prefer Reader output: HentaiMama's raw HTML can load successfully
            // through AllOrigins while not matching the catalogue parser.
            candidates = [HENTAI_MAMA_READER + url, url, HENTASIS_PROXY + encodeURIComponent(url)];
        }
        else if (postData && url.indexOf(HENTAI_MAMA) === 0) {
            candidates.push(HENTAI_MAMA_POST_PROXY + encodeURIComponent(url));
        }

        var index = 0;
        var current;
        function next() {
            if (index >= candidates.length) {
                if (failure) failure();
                return;
            }

            var target = candidates[index++];
            current = $.ajax({
                url: target,
                type: postData ? 'POST' : 'GET',
                data: postData || undefined,
                dataType: isJson ? 'json' : 'text',
                timeout: 30000,
                success: success,
                error: next
            });
        }

        next();
        return current;
    }

    function decodeHtml(value) {
        var area = document.createElement('textarea');
        area.innerHTML = value || '';
        return area.value;
    }

    function stripHtml(value) {
        return decodeHtml(String(value || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ')).trim();
    }

    function parseHentasisPage(html) {
        var videos = [];
        var blocks = String(html || '').match(/<div class="short-item">[\s\S]*?(?=<div class="short-item">|$)/gi) || [];
        blocks.forEach(function (block) {
            var link = block.match(/class="short-link nowrap" href="([^"]+)"/i);
            var title = block.match(/class="short-link nowrap" href="[^"]+"[^>]*>([\s\S]*?)<\/a>/i);
            var poster = block.match(/class="short-img"[\s\S]*?<img[^>]+src="([^"]+)"/i);
            if (!link || !title || !/\/\d+-[^/]+\.html(?:$|\?)/i.test(link[1])) return;
            videos.push({
                title: stripHtml(title[1]),
                page_url: link[1].indexOf('http') === 0 ? link[1] : HENTASIS + link[1],
                poster_url: poster ? (poster[1].indexOf('http') === 0 ? poster[1] : HENTASIS + poster[1]) : ''
            });
        });
        return videos;
    }

    function parseMamaPage(html) {
        var videos = [];
        var source = String(html || '');
        if (source.indexOf('Markdown Content:') !== -1) {
            var cards = /\[!\[Image \d+: ([^\]]*)\]\((https?:\/\/[^)]+)\)\]\((https?:\/\/[^)]+)\)[\s\S]{0,180}?### \[([^\]]+)\]\((https?:\/\/[^)]+)\)/gi;
            var card;
            while ((card = cards.exec(source))) {
                videos.push({ title: stripHtml(card[4]), page_url: card[3], poster_url: card[2] });
            }
            return videos;
        }
        var blocks = source.match(/<article class="item"[\s\S]*?<\/article>/gi) || [];
        blocks.forEach(function (block) {
            var link = block.match(/<a href="([^"]+)"[^>]*><img/i);
            var title = block.match(/class="title"[^>]*>([\s\S]*?)<\/h3>/i);
            var image = block.match(/<img[^>]+src="([^"]+)"/i);
            if (!link || !title) return;
            videos.push({
                title: stripHtml(title[1]),
                page_url: link[1],
                poster_url: image ? image[1] : ''
            });
        });
        return videos;
    }

    function mamaCategories(html) {
        var categories = [];
        var source = String(html || '');
        var markdown = /\[([^\]]+)\]\(https?:\/\/hentaimama\.io\/genre\/([^/)]+)\/?\)/gi;
        var genre;
        while ((genre = markdown.exec(source))) {
            if (!categories.some(function (item) { return item.slug === genre[2]; })) {
                categories.push({ title: stripHtml(genre[1]), slug: genre[2] });
            }
        }
        var matches = source.match(/<a[^>]+href="https?:\/\/hentaimama\.io\/genre\/([^/"?#]+)\/?"[^>]*>([\s\S]*?)<\/a>/gi) || [];
        matches.forEach(function (match) {
            var data = match.match(/href="https?:\/\/hentaimama\.io\/genre\/([^/"?#]+)\/?"[^>]*>([\s\S]*?)<\/a>/i);
            if (!data) return;
            var slug = data[1];
            var title = stripHtml(data[2]);
            if (title && !categories.some(function (item) { return item.slug === slug; })) categories.push({ title: title, slug: slug });
        });
        return categories;
    }

    function openMamaShow(video) {
        request(video.page_url, function (html) {
            var episodes = [];
            var source = String(html || '');
            if (source.indexOf('Markdown Content:') !== -1) {
                var episodeLinks = /\[([^\]]+)\]\((https?:\/\/hentaimama\.io\/episodes\/[^)]+)\)/gi;
                var episodeLink;
                while ((episodeLink = episodeLinks.exec(source))) {
                    episodes.push({ title: stripHtml(episodeLink[1]), url: episodeLink[2] });
                }
            }
            var links = source.match(/<a class="dt-se-item" href="[^"]+"[\s\S]*?<\/a>/gi) || [];
            links.forEach(function (link) {
                var href = link.match(/href="([^"]+)"/i);
                var label = link.match(/<span class="dt-se-title"[^>]*>([\s\S]*?)<\/span>/i) || link.match(/<span class="dt-se-num"[^>]*>([\s\S]*?)<\/span>/i);
                if (href) episodes.push({ title: label ? stripHtml(label[1]) : ('Серия ' + (episodes.length + 1)), url: href[1] });
            });
            if (!episodes.length) {
                Lampa.Noty.show('Для этого видео не найдены серии');
                return;
            }
            Lampa.Select.show({
                title: video.title,
                items: episodes.map(function (episode) {
                    return { title: episode.title, onSelect: function () { playMamaEpisode(video, episode); } };
                })
            });
        }, function () {
            Lampa.Noty.show('Не удалось открыть HentaiMama');
        });
    }

    function playMamaEpisode(video, episode) {
        request(episode.url, function (html) {
            var id = String(html || '').match(/data-post-id="(\d+)"/i);
            var options = [];
            var found = String(html || '').match(/href="#option-(\d+)"/gi) || [];
            found.forEach(function (item) {
                var number = item.match(/option-(\d+)/i);
                if (number && !options.some(function (value) { return value === number[1]; })) options.push(number[1]);
            });
            if (!id || !options.length) {
                Lampa.Noty.show('На странице серии не найдены источники видео');
                return;
            }
            getMamaPlayer(video, episode, id[1], options[0]);
        }, function () {
            Lampa.Noty.show('Не удалось загрузить страницу серии');
        });
    }

    function getMamaPlayer(video, episode, id, mirror) {
        var endpoint = HENTAI_MAMA + '/wp-admin/admin-ajax.php';
        request(endpoint, function (response) {
            var parts;
            try { parts = typeof response === 'string' ? JSON.parse(response) : response; }
            catch (error) { parts = null; }
            var html = parts && parts[Number(mirror) - 1] || '';
            var embed = String(html).match(/src="(https?:[^" ]*dt_embed[^" ]+)"/i);
            if (!embed) {
                Lampa.Noty.show('Не удалось получить видеопоток HentaiMama');
                return;
            }
            var embedUrl = decodeHtml(embed[1]).replace(/\\\//g, '/').replace(/&amp;/g, '&');
            request(embedUrl, function (page) {
                var source = String(page || '').match(/"file"\s*:\s*"(https?:[^" ]+?\.(?:mp4|m3u8|mpd)(?:\?[^" ]*)?)"/i);
                if (!source) {
                    Lampa.Noty.show('Видеопоток не найден');
                    return;
                }
                var url = decodeHtml(source[1]).replace(/\\\//g, '/').replace(/\\u0026/gi, '&');
                Lampa.Player.play({ url: url, title: video.title + ' — ' + episode.title, thumbnail: video.poster_url, quality: 'auto' });
            }, function () {
                Lampa.Noty.show('Не удалось открыть видеопоток HentaiMama');
            });
        }, function () {
            Lampa.Noty.show('Не удалось запросить зеркало HentaiMama');
        }, { action: 'get_player_contents', a: id, i: mirror });
    }

    function playHentasis(video) {
        request(video.page_url, function (html) {
            var matches = String(html || '').match(/file\s*:\s*"(https?:[^" ]+?\.(?:mp4|m3u8|mpd)(?:\?[^" ]*)?)"/gi) || [];
            var streams = [];
            matches.forEach(function (match) {
                var url = match.match(/"(https?:[^" ]+)"/i);
                if (!url) return;
                var src = decodeHtml(url[1]).replace(/\\\//g, '/').replace(/\\u0026/gi, '&');
                if (!streams.some(function (item) { return item.url === src; })) {
                    streams.push({ title: 'Видео ' + (streams.length + 1), url: src });
                }
            });
            if (!streams.length) {
                Lampa.Noty.show('На странице не найдены прямые видеофайлы');
                return;
            }
            function start(stream) {
                Lampa.Player.play({ url: stream.url, title: video.title, thumbnail: video.poster_url, quality: 'auto' });
            }
            if (streams.length === 1) start(streams[0]);
            else Lampa.Select.show({
                title: video.title,
                items: streams.map(function (stream) {
                    return { title: stream.title, onSelect: function () { start(stream); } };
                })
            });
        }, function () {
            Lampa.Noty.show('Не удалось открыть страницу Hentasis');
        });
    }

    function imageUrl(video) {
        var image = video.poster_url || video.poster || '';
        if (!image) return '';
        return /^https?:\/\//i.test(image) ? image : SITE + (image.charAt(0) === '/' ? '' : '/') + image;
    }

    function ListScreen(object) {
        var self = this;
        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var page = Number(object.page) || 1;
        var loading = false;
        var maxPage = 1;
        var alive = true;
        var source = object.source || 'hentabaza';
        var baseUrl = object.query
            ? API + '/search.php?q=' + encodeURIComponent(object.query)
            : API + '/trending.php?sort=' + encodeURIComponent(object.sort || 'latest');

        function load(nextPage) {
            if (loading || nextPage > maxPage) return;
            loading = true;
            page = nextPage;
            self.activity.loader(true);

            var url = source === 'hentasis'
                ? (object.query ? HENTASIS + '/' : HENTASIS + (page === 1 ? '/' : '/page/' + page + '/'))
                : source === 'hentaimama'
                    ? (object.category
                        ? HENTAI_MAMA + '/genre/' + object.category + '/' + (page === 1 ? '' : 'page/' + page + '/')
                        : HENTAI_MAMA + (page === 1 ? '/' : '/page/' + page + '/') + (object.query ? '?s=' + encodeURIComponent(object.query) : ''))
                : baseUrl + '&page=' + page + '&per_page=20';
            var postData = source === 'hentasis' && object.query
                ? { do: 'search', subaction: 'search', story: object.query }
                : null;

            request(url, function (data) {
                if (!alive) return;
                loading = false;
                self.activity.loader(false);

                if (source === 'hentabaza' && typeof data === 'string') {
                    try { data = JSON.parse(data); } catch (error) { data = null; }
                }
                var results = source === 'hentasis'
                    ? parseHentasisPage(data)
                    : source === 'hentaimama'
                        ? parseMamaPage(data)
                        : (data && Array.isArray(data.results) ? data.results : []);
                maxPage = source === 'hentasis'
                    ? (results.length >= 9 ? 99 : page)
                    : source === 'hentaimama'
                        ? (results.length ? 99 : page)
                        : (Number(data && data.total_pages) || 1);

                results.forEach(function (video) {
                    var title = safeText(video.title || 'Без названия');
                    var poster = imageUrl(video);
                    var duration = Number(video.duration) || 0;
                    var meta = duration ? Math.floor(duration / 60) + ' мин.' : '';
                    var item = $('<div class="selector habaza-item">' +
                        (poster ? '<div class="habaza-poster" style="background-image:url(&quot;' + safeText(poster) + '&quot;)"></div>' : '<div class="habaza-poster"></div>') +
                        '<div class="habaza-info"><div class="habaza-title">' + title + '</div>' +
                        '<div class="habaza-meta">' + safeText(meta) + '</div></div></div>');

                    item.on('hover:enter click', function () {
                        if (source === 'hentasis') playHentasis(video);
                        else if (source === 'hentaimama') openMamaShow(video);
                        else openVideo(video);
                    });
                    item.on('hover:focus', function () {
                        scroll.update(this);
                    });
                    scroll.append(item);
                });

                if (results.length && page < maxPage) {
                    var more = $('<div class="selector habaza-more">Загрузить еще</div>');
                    more.on('hover:enter click', function () {
                        more.remove();
                        load(page + 1);
                    });
                    scroll.append(more);
                }

                if (!results.length && page === 1) {
                    if (self.activity && typeof self.activity.empty === 'function') self.activity.empty();
                    else Lampa.Noty.show('В этой категории ничего не найдено');
                }
                Lampa.Controller.enable('content');
                Lampa.Controller.toggle('content');
                var root = scroll.render();
                if (page === 1 && results.length) {
                    if (Lampa.Controller.collectionSet) Lampa.Controller.collectionSet(root);
                    if (Lampa.Controller.collectionFocus) {
                        Lampa.Controller.collectionFocus(root.find('.selector').first(), root);
                    }
                    else if (Lampa.Controller.focus) Lampa.Controller.focus(root.find('.selector').first());
                }
            }, function () {
                if (!alive) return;
                loading = false;
                self.activity.loader(false);
                Lampa.Noty.show('Не удалось загрузить каталог ' + (source === 'hentasis' ? 'Hentasis' : source === 'hentaimama' ? 'HentaiMama' : 'HentaiBaza'));
            }, postData);
        }

        function openVideo(video) {
            var url = video.file_url || video.url;
            if (!url || !/^https:\/\//i.test(url)) {
                Lampa.Noty.show('Для этого видео нет прямой ссылки');
                return;
            }
            Lampa.Player.play({
                url: url,
                title: video.title || 'HentaiBaza',
                thumbnail: imageUrl(video),
                quality: 'auto'
            });
        }

        this.create = function () {
            $('head').append('<style id="habaza-style">' +
                '.habaza-item{display:flex;align-items:center;gap:1.2em;padding:0.8em 1em;margin:0.4em 0;background:rgba(255,255,255,.04);border-radius:.3em;min-height:7em;cursor:pointer}' +
                '.habaza-item.focus,.habaza-more.focus{outline:3px solid rgba(255,255,255,.9);outline-offset:2px}' +
                '.habaza-poster{width:8em;height:6.5em;flex:0 0 8em;background:#222 center/cover no-repeat;border-radius:.25em}' +
                '.habaza-info{min-width:0}.habaza-title{font-size:1.1em;line-height:1.35}.habaza-meta{margin-top:.45em;opacity:.55;font-size:.85em}' +
                '.habaza-more{text-align:center;padding:1em;margin:1em;background:rgba(255,255,255,.06);border-radius:.3em}' +
                '</style>');
            load(page);
            return this.render();
        };
        this.start = function () {};
        this.render = function () { return scroll.render(); };
        this.destroy = function () {
            alive = false;
            scroll.destroy();
            $('#habaza-style').remove();
        };
    }

    function openList(title, params) {
        Lampa.Activity.push({
            url: 'hentabaza',
            title: title,
            component: 'hentabaza_list',
            page: 1,
            sort: params.sort,
            query: params.query,
            source: params.source || 'hentabaza',
            category: params.category
        });
    }

    function showMamaCategories() {
        request(HENTAI_MAMA + '/', function (html) {
            var categories = mamaCategories(html);
            if (!categories.length) {
                Lampa.Noty.show('Не удалось загрузить категории HentaiMama');
                return;
            }
            Lampa.Select.show({
                title: 'Категории HentaiMama',
                items: categories.map(function (category) {
                    return { title: category.title, onSelect: function () {
                        openList('HentaiMama — ' + category.title, { source: 'hentaimama', category: category.slug });
                    } };
                })
            });
        }, function () {
            Lampa.Noty.show('Не удалось загрузить категории HentaiMama');
        });
    }

    function showCatalog(source) {
        var isHentasis = source === 'hentasis';
        var isMama = source === 'hentaimama';
        Lampa.Select.show({
            title: isHentasis ? 'Hentasis' : isMama ? 'HentaiMama' : 'HentaiBaza',
            items: [
                { title: 'Новые', onSelect: function () { openList((isHentasis ? 'Hentasis' : isMama ? 'HentaiMama' : 'HentaiBaza') + ' — новые', { sort: 'latest', source: source }); } }
            ].concat(isMama ? [
                { title: 'Категории', onSelect: showMamaCategories },
                { title: 'Поиск', onSelect: function () {
                    Lampa.Input.edit({
                        title: 'Поиск HentaiMama', value: '', placeholder: 'Название видео', free: true,
                        onBack: function () { Lampa.Controller.toggle('content'); },
                        onEnter: function (query) {
                            query = String(query || '').trim();
                            if (query) openList('HentaiMama — ' + query, { source: source, query: query });
                        }
                    });
                } }
            ] : isHentasis ? [] : [
                { title: 'Поиск', onSelect: function () {
                    Lampa.Input.edit({
                        title: 'Поиск: ' + (isHentasis ? 'Hentasis' : 'HentaiBaza'),
                        value: '',
                        placeholder: 'Название видео',
                        free: true,
                        onBack: function () { Lampa.Controller.toggle('content'); },
                        onEnter: function (query) {
                            query = String(query || '').trim();
                            if (query) openList('Поиск: ' + query, { query: query, source: source });
                        }
                    });
                } },
                { title: 'Популярные', onSelect: function () { openList('HentaiBaza — популярные', { sort: 'rating', source: source }); } }
            ]),
            onBack: function () { Lampa.Controller.toggle('content'); }
        });
    }

    function showMenu() {
        Lampa.Select.show({
            title: 'Источники',
            items: [
                { title: 'HentaiBaza', onSelect: function () { showCatalog('hentabaza'); } },
                { title: 'Hentasis', onSelect: function () { showCatalog('hentasis'); } },
                { title: 'HentaiMama', onSelect: function () { showCatalog('hentaimama'); } }
            ],
            onBack: function () { Lampa.Controller.toggle('content'); }
        });
    }

    function init() {
        if (Lampa.Component.get('hentabaza_list')) return;
        Lampa.Component.add('hentabaza_list', ListScreen);
        Lampa.Menu.addButton(
            '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M4 5h16v2H4zm0 6h16v2H4zm0 6h16v2H4z"/></svg>',
            'Hent',
            showMenu
        );
    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', function (event) {
        if (event.type === 'ready') init();
    });
})();
