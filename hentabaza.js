(function () {
    'use strict';

    if (window.plugin_hentabaza_ready) return;
    window.plugin_hentabaza_ready = true;

    var API = 'https://hentaibaza.com/api';
    var SITE = 'https://hentaibaza.com';
    var HENTASIS = 'https://hentasis1.top';
    var ANIMEFOX = 'https://www.animefox.org';
    var HENTASIS_PROXY = 'https://api.allorigins.win/raw?url=';
    var HENTASIS_READER = 'https://proxy.cors.dev/';
    var ANIMEFOX_CORS = 'https://proxy.cors.dev/';

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
        else if (!postData && url.indexOf(ANIMEFOX) === 0) {
            candidates.push(ANIMEFOX_CORS + url);
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

    function parseAnimeFoxPage(html) {
        var videos = [];
        var blocks = String(html || '').match(/<article class="short\b[\s\S]*?<\/article>/gi) || [];
        blocks.forEach(function (block) {
            var link = block.match(/class="short-title" href="([^"]+)"/i) || block.match(/data-innerlink="([^"]+)"/i);
            var title = block.match(/class="short-title"[^>]*>[\s\S]*?<h2[^>]*>([\s\S]*?)<\/h2>/i);
            var poster = block.match(/class="[^"]*poster[^"]*"[^>]+src="([^"]+)"/i);
            var meta = block.match(/class="short-meta[^>]*>([\s\S]*?)<\/div>/i);
            if (!link || !title) return;
            videos.push({
                title: stripHtml(title[1]),
                page_url: link[1].indexOf('http') === 0 ? link[1] : ANIMEFOX + link[1],
                poster_url: poster ? (poster[1].indexOf('http') === 0 ? poster[1] : ANIMEFOX + poster[1]) : '',
                meta: meta ? stripHtml(meta[1]) : '',
                source: 'animefox'
            });
        });
        return videos;
    }

    function animeFoxCategories(html) {
        var categories = [];
        var links = String(html || '').match(/<a[^>]+href="[^"]+"[^>]*>[\s\S]*?<\/a>/gi) || [];
        links.forEach(function (link) {
            var href = link.match(/href="(https?:\/\/www\.animefox\.org)?(\/[^"?#]+)"/i);
            if (!href) return;
            var path = href[2];
            var match = path.match(/^\/(hentai(?:\/[^/]+)?|3d-hentai|hentai-other)\/?$/i);
            if (!match || /\.html$/i.test(path) || /\/page\//i.test(path)) return;
            var slug = match[1];
            if (slug === 'hentai') return;
            var title = stripHtml(link.replace(/<img[^>]*>/gi, ''));
            if (!title || categories.some(function (item) { return item.path === path; })) return;
            categories.push({ title: title, path: path.charAt(path.length - 1) === '/' ? path : path + '/' });
        });
        return categories;
    }

    function parseAnimeFoxResponse(response) {
        if (response && typeof response === 'object') return response;
        try { return JSON.parse(String(response || '')); }
        catch (error) { return null; }
    }

    function openAnimeFoxShow(video) {
        request(video.page_url, function (html) {
            var id = String(html || '').match(/id="iframePlayer-(\d+)"/i);
            if (!id) {
                Lampa.Noty.show('На странице AnimeFox не найден видеоплеер');
                return;
            }
            var endpoint = ANIMEFOX + '/index.php?controller=ajax&mod=iframePlayer&post_id=' + id[1] + '&select=';
            request(endpoint, function (data) {
                var response = parseAnimeFoxResponse(data);
                var options = [];
                var selects = String(response && response.selectors || '').match(/<option[^>]+value="([^"]+)"[^>]*>([\s\S]*?)<\/option>/gi) || [];
                selects.forEach(function (option) {
                    var value = option.match(/value="([^"]+)"/i);
                    var title = option.match(/>([\s\S]*?)<\/option>/i);
                    if (value && value[1] && !options.some(function (item) { return item.value === value[1]; })) {
                        options.push({ value: value[1], title: title ? stripHtml(title[1]) : value[1] });
                    }
                });
                if (!response || !response.success) {
                    Lampa.Noty.show('Не удалось получить серии AnimeFox');
                    return;
                }
                if (!options.length) {
                    openAnimeFoxPlayer(video, response.player);
                    return;
                }
                Lampa.Select.show({
                    title: video.title,
                    items: options.map(function (episode) {
                        return { title: episode.title, onSelect: function () { playAnimeFoxEpisode(video, id[1], episode); } };
                    })
                });
            }, function () { Lampa.Noty.show('Не удалось получить серии AnimeFox'); });
        }, function () { Lampa.Noty.show('Не удалось открыть AnimeFox'); });
    }

    function playAnimeFoxEpisode(video, id, episode) {
        var endpoint = ANIMEFOX + '/index.php?controller=ajax&mod=iframePlayer&post_id=' + id + '&select=' + encodeURIComponent('series=' + episode.value);
        request(endpoint, function (data) {
            var response = parseAnimeFoxResponse(data);
            if (!response || !response.success) {
                Lampa.Noty.show('Не удалось загрузить серию AnimeFox');
                return;
            }
            openAnimeFoxPlayer(video, response.player);
        }, function () { Lampa.Noty.show('Не удалось загрузить серию AnimeFox'); });
    }

    function openAnimeFoxPlayer(video, playerHtml) {
        var iframe = String(playerHtml || '').match(/<iframe[^>]+src="([^"]+)"/i);
        if (!iframe) {
            Lampa.Noty.show('Видеоплеер AnimeFox не вернул ссылку');
            return;
        }
        var url = decodeHtml(iframe[1]).replace(/\\\//g, '/').replace(/&amp;/g, '&');
        Lampa.Activity.push({
            url: url,
            title: video.title,
            component: 'animefox_player'
        });
    }

    function AnimeFoxPlayer(object) {
        var html;
        this.create = function () {
            html = $('<div class="animefox-player"><iframe src="' + safeText(object.url) + '" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div>');
            Lampa.Controller.add('animefox_player', {
                toggle: function () { html.find('iframe')[0].focus(); },
                enter: function () { html.find('iframe')[0].focus(); },
                back: function () { Lampa.Activity.backward(); },
                up: function () {}, down: function () {}, left: function () {}, right: function () {}
            });
            Lampa.Controller.toggle('animefox_player');
            return html;
        };
        this.start = function () { if (html) html.find('iframe')[0].focus(); };
        this.render = function () { return html; };
        this.destroy = function () { if (html) html.remove(); };
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
        var base = video.source === 'animefox' ? ANIMEFOX : SITE;
        return /^https?:\/\//i.test(image) ? image : base + (image.charAt(0) === '/' ? '' : '/') + image;
    }

    function ListScreen(object) {
        var self = this;
        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var page = Number(object.page) || 1;
        var loading = false;
        var maxPage = 1;
        var alive = true;
        var focusIndex = 0;
        var source = object.source || 'hentabaza';
        var baseUrl = object.query
            ? API + '/search.php?q=' + encodeURIComponent(object.query)
            : API + '/trending.php?sort=' + encodeURIComponent(object.sort || 'latest');

        function focusItem(index) {
            var items = scroll.render().find('.selector');
            if (!items.length) return;
            focusIndex = Math.max(0, Math.min(index, items.length - 1));
            items.removeClass('focus');
            var item = items.eq(focusIndex);
            item.addClass('focus').trigger('hover:focus');
            scroll.update(item[0]);
        }

        function activateFocused() {
            var item = scroll.render().find('.selector').eq(focusIndex);
            if (item.length) item.trigger('hover:enter');
        }

        function moveFocus(dx, dy) {
            var items = scroll.render().find('.selector');
            if (!items.length) return;
            var current = items.eq(focusIndex)[0];
            if (!current) return focusItem(0);
            var rect = current.getBoundingClientRect();
            var cx = rect.left + rect.width / 2;
            var cy = rect.top + rect.height / 2;
            var best = -1;
            var score = Infinity;
            items.each(function (index) {
                if (index === focusIndex) return;
                var box = this.getBoundingClientRect();
                var x = box.left + box.width / 2 - cx;
                var y = box.top + box.height / 2 - cy;
                if ((dx && x * dx <= 0) || (dy && y * dy <= 0)) return;
                var primary = dx ? Math.abs(x) : Math.abs(y);
                var secondary = dx ? Math.abs(y) : Math.abs(x);
                var value = primary + secondary * 2.5;
                if (value < score) { score = value; best = index; }
            });
            if (best >= 0) focusItem(best);
        }

        function enableListControls() {
            if (Lampa.Controller.add && Lampa.Controller.toggle) {
                Lampa.Controller.add('hentabaza_items', {
                    toggle: function () { focusItem(focusIndex); },
                    up: function () { moveFocus(0, -1); },
                    down: function () { moveFocus(0, 1); },
                    left: function () { moveFocus(-1, 0); },
                    right: function () { moveFocus(1, 0); },
                    enter: activateFocused,
                    back: function () { Lampa.Activity.backward(); }
                });
                Lampa.Controller.toggle('hentabaza_items');
                focusItem(focusIndex);
            }
            else {
                Lampa.Controller.enable('content');
                Lampa.Controller.toggle('content');
                var root = scroll.render();
                if (Lampa.Controller.collectionSet) Lampa.Controller.collectionSet(root);
                if (Lampa.Controller.collectionFocus) Lampa.Controller.collectionFocus(root.find('.selector').first(), root);
            }
        }

        function load(nextPage) {
            if (loading || nextPage > maxPage) return;
            loading = true;
            page = nextPage;
            self.activity.loader(true);

            var url = source === 'hentasis'
                ? (object.query ? HENTASIS + '/' : HENTASIS + (page === 1 ? '/' : '/page/' + page + '/'))
                : source === 'animefox'
                    ? (object.category
                        ? ANIMEFOX + object.category + (page === 1 ? '' : 'page/' + page + '/')
                        : object.query
                            ? ANIMEFOX + '/index.php?do=search&subaction=search&story=' + encodeURIComponent(object.query) + '&catlist%5B%5D=102'
                            : ANIMEFOX + '/hentai/' + (page === 1 ? '' : 'page/' + page + '/'))
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
                    : source === 'animefox'
                        ? parseAnimeFoxPage(data)
                        : (data && Array.isArray(data.results) ? data.results : []);
                maxPage = source === 'hentasis'
                    ? (results.length >= 9 ? 99 : page)
                    : source === 'animefox'
                        ? (results.length ? 99 : page)
                        : (Number(data && data.total_pages) || 1);

                results.forEach(function (video) {
                    var title = safeText(video.title || 'Без названия');
                    var poster = imageUrl(video);
                    var duration = Number(video.duration) || 0;
                    var meta = video.meta || (duration ? Math.floor(duration / 60) + ' мин.' : '');
                    var item = $('<div class="selector habaza-item">' +
                        (poster ? '<div class="habaza-poster" style="background-image:url(&quot;' + safeText(poster) + '&quot;)"></div>' : '<div class="habaza-poster"></div>') +
                        '<div class="habaza-info"><div class="habaza-title">' + title + '</div>' +
                        '<div class="habaza-meta">' + safeText(meta) + '</div></div></div>');

                    item.on('hover:enter click', function () {
                        if (source === 'hentasis') playHentasis(video);
                        else if (source === 'animefox') openAnimeFoxShow(video);
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
                if (results.length) enableListControls();
            }, function () {
                if (!alive) return;
                loading = false;
                self.activity.loader(false);
                Lampa.Noty.show('Не удалось загрузить каталог ' + (source === 'hentasis' ? 'Hentasis' : source === 'animefox' ? 'AnimeFox' : 'HentaiBaza'));
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
                '.habaza-scroll{height:calc(100vh - 7em);max-height:calc(100vh - 7em);overflow:hidden}' +
                '.habaza-scroll .scroll__content{height:100%;overflow:hidden}' +
                '.habaza-scroll .scroll__body{display:flex!important;flex-flow:row wrap;gap:1em;align-content:flex-start;padding:1em}' +
                '.habaza-item{display:flex;flex:0 0 calc(25% - 1em);flex-direction:column;gap:.65em;padding:.65em;margin:.2em;background:rgba(255,255,255,.05);border-radius:.45em;cursor:pointer;min-width:12em;box-sizing:border-box}' +
                '.habaza-item.focus,.habaza-more.focus{outline:3px solid rgba(255,255,255,.9);outline-offset:2px}' +
                '.habaza-poster{width:100%;aspect-ratio:2/3;background:#222 center/cover no-repeat;border-radius:.3em}' +
                '.habaza-info{min-width:0}.habaza-title{font-size:1em;line-height:1.3;max-height:2.6em;overflow:hidden}.habaza-meta{margin-top:.35em;opacity:.65;font-size:.8em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
                '.habaza-more{text-align:center;padding:1em;margin:1em;background:rgba(255,255,255,.06);border-radius:.3em}' +
                '.animefox-player{width:100%;height:calc(100vh - 2em);background:#000}.animefox-player iframe{width:100%;height:100%;border:0}' +
                '</style>');
            load(page);
            return this.render();
        };
        this.start = function () { if (scroll.render().find('.selector').length) enableListControls(); };
        this.render = function () {
            var root = scroll.render();
            root.addClass('habaza-scroll');
            var element = root[0];
            if (element && !element.hentWheelHandler) {
                element.hentWheelHandler = function (event) {
                    if (Math.abs(event.deltaY) >= Math.abs(event.deltaX)) {
                        event.preventDefault();
                        event.stopImmediatePropagation();
                        scroll.wheel(event.deltaY);
                    }
                };
                element.addEventListener('wheel', element.hentWheelHandler, true);
            }
            return root;
        };
        this.destroy = function () {
            alive = false;
            var element = scroll.render()[0];
            if (element && element.hentWheelHandler) {
                element.removeEventListener('wheel', element.hentWheelHandler, true);
                delete element.hentWheelHandler;
            }
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

    function showAnimeFoxCategories() {
        request(ANIMEFOX + '/hentai/', function (html) {
            var categories = animeFoxCategories(html);
            if (!categories.length) {
                Lampa.Noty.show('Не удалось загрузить категории AnimeFox');
                return;
            }
            Lampa.Select.show({
                title: 'Категории AnimeFox',
                items: categories.map(function (category) {
                    return { title: category.title, onSelect: function () {
                        openList('AnimeFox — ' + category.title, { source: 'animefox', category: category.path });
                    } };
                })
            });
        }, function () {
            Lampa.Noty.show('Не удалось загрузить категории AnimeFox');
        });
    }

    function showCatalog(source) {
        var isHentasis = source === 'hentasis';
        var isAnimeFox = source === 'animefox';
        Lampa.Select.show({
            title: isHentasis ? 'Hentasis' : isAnimeFox ? 'AnimeFox' : 'HentaiBaza',
            items: [
                { title: 'Новые', onSelect: function () { openList((isHentasis ? 'Hentasis' : isAnimeFox ? 'AnimeFox' : 'HentaiBaza') + ' — новые', { sort: 'latest', source: source }); } }
            ].concat(isAnimeFox ? [
                { title: 'Категории', onSelect: showAnimeFoxCategories },
                { title: 'Поиск', onSelect: function () {
                    Lampa.Input.edit({
                        title: 'Поиск AnimeFox', value: '', placeholder: 'Название видео', free: true,
                        onBack: function () { Lampa.Controller.toggle('content'); },
                        onEnter: function (query) {
                            query = String(query || '').trim();
                            if (query) openList('AnimeFox — ' + query, { source: source, query: query });
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
                { title: 'AnimeFox', onSelect: function () { showCatalog('animefox'); } }
            ],
            onBack: function () { Lampa.Controller.toggle('content'); }
        });
    }

    function init() {
        if (Lampa.Component.get('hentabaza_list')) return;
        Lampa.Component.add('hentabaza_list', ListScreen);
        Lampa.Component.add('animefox_player', AnimeFoxPlayer);
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
