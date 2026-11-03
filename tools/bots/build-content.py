#!/usr/bin/env python3
"""Builds supabase/21b_bots_content.sql: the bot roster, the reply lines, Feed posts, chat scenes and Tutorial guides.
EDIT THE LISTS BELOW, then run:  python3 tools/bots/build-content.py   (it rewrites supabase/21b_bots_content.sql; re-run that file in the SQL Editor).
Rules for every line: safe for a 13-year-old, no links, no phone numbers, no money requests, no romance, no medical/financial advice, under 200 characters.
{name} in a reply line becomes the person's username.  tone = None means any bot may say it; 'jokes' | 'chill' | 'serious' | 'sporty' limits it to that kind of bot."""
import os

ROSTER = [  # username, gender, tone, school, dept, level
 ('tolu_ade','f','jokes','soc','computer_science','200'), ('amaka_o','f','chill','sos','biochemistry','300'), ('zainab_k','f','serious','set','architecture','400'),
 ('ngozi_eze','f','chill','seet','civil_and_environmental_engineering','300'), ('bisi_lagos','f','jokes','saat','food_science_and_technology','200'),
 ('halima_m','f','serious','sems','applied_geology','300'), ('ifeoma_c','f','chill','soc','software_engineering','100'), ('kemi_ojo','f','jokes','sos','mathematical_sciences','200'),
 ('efe_osas','f','chill','smat','entrepreneurship_management_technology','300'), ('seyi_b','f','serious','seet','electrical_and_electronics_engineering','400'),
 ('blessing_u','f','chill','saat','crop_soil_and_pest_management','100'), ('funke_a','f','jokes','set','estate_management','300'), ('chiamaka_n','f','sporty','soc','cyber_security','200'),
 ('yetunde_ak','f','chill','sos','biology','100'), ('rukayat_o','f','serious','shht','physiology','300'),
 ('segun_a','m','jokes','seet','mechanical_engineering','300'), ('chidi_o','m','serious','soc','computer_science','400'), ('emeka_n','m','sporty','seet','computer_engineering','200'),
 ('tunde_bam','m','jokes','set','quantity_surveying','300'), ('ibrahim_y','m','serious','sems','applied_geophysics','300'), ('dayo_k','m','chill','sos','physics','200'),
 ('femi_adx','m','jokes','soc','information_technology','100'), ('uche_p','m','sporty','seet','mining_engineering','400'), ('kelechi_i','m','chill','sos','chemistry','300'),
 ('musa_d','m','chill','saat','animal_production_and_health','200'), ('taiwo_s','m','sporty','set','building_technology','200'), ('obinna_t','m','serious','seet','materials_and_metallurgical_engineering','300'),
 ('wale_ola','m','jokes','soc','software_engineering','300'), ('david_ef','m','chill','smat','project_management_technology','200'), ('ayo_bright','m','chill','seet','civil_and_environmental_engineering','100'),
]

# ---------------------------------------------------------------- reply lines (pack -> [(tone, text)])
L = {}
def P(pack, *lines):
    L.setdefault(pack, []).extend([(None, x) if isinstance(x, str) else x for x in lines])

P('wave', "Hey {name}! 👋 Thanks for the wave. I'm one of the campus bots here, so I answer fast and I love a good gist.",
  "Welcome {name}! 👋 Campus bot here. Ask me about lectures, food, light, football, anything campus.",
  "Hi {name} 😄 Thanks for waving! I'm a bot, but a friendly one. What's up?",
  "Oya {name}, welcome! 🙌 I'm a campus bot. Say hi anytime.")
P('greet', "Hey {name}! How far? 😄", "Hi {name}! How's your day going?", "Hello {name} 👋 Good to see you here.", "Heyy {name}! What's the vibe today?", "Hi {name}! Hope your day is going well 🙂",
  ('jokes', "Ah {name}! The one and only. How body? 😂"), ('chill', "Hey {name}, all good? Just relaxing over here."), ('serious', "Hello {name}. I hope you're having a productive day."), ('sporty', "Yo {name}! Ready for today? 💪"))
P('ask', "What department are you in?", "Which level are you?", "How's the semester treating you?", "Have you tried Campus Dash in the Arcade yet?", "What's your favourite place on campus?",
  "Are you more of a morning or night reader?", "Do you follow football?", "Which hostel area are you in?")
P('thanks', "You're welcome {name}! 😊", "Anytime {name}!", "No wahala {name} 🙌", "Glad to help, {name}!", ('jokes', "Don't mention it {name}, I only charge in good vibes 😂"))
P('bye', "Alright {name}, catch you later! 👋", "Take care {name}! Come back soon.", "Bye {name}! Stay safe out there 🙂", "See you {name}! Don't forget to rest well.", ('jokes', "Go well {name}! Don't let the lecturer see you 😂"))
P('bot_q', "Good question, {name}! I'm a campus bot 🤖, an automated helper. The badge next to my name tells you so. I'm still happy to chat!",
  "Yes {name}, I'm a bot 🤖 (see the BOT tag). I can chat, share tips and gist, but I'm not a real student.",
  "Fair question! I'm an automated campus bot, not a person. Real players don't have the BOT tag.",
  "I'm a bot, {name} 🤖. I answer from a list of things I know, so I'm not perfect, but I try!")
P('crisis', "{name}, I'm so sorry you're going through this. You matter, and you don't have to carry it alone. Please talk to someone you trust now, or your school counsellor. If you're in danger, call your local emergency number.",
  "I'm really sorry it feels this heavy, {name}. I'm only a bot, so I can't give the help you deserve. Please reach out to a trusted person or a counsellor today. If you're unsafe, call emergency services.",
  "{name}, thank you for telling someone. Please don't stay alone with this: talk to a person you trust, a counsellor or a health worker right away. If you're unsafe right now, call emergency services.")
P('money_ask', "I can't send or lend money, {name}. Bots don't have any, and please be careful about anyone asking for money here 🙏", "Sorry {name}, I can't give or receive money. Stay safe and never share your details with anyone.",
  "No money matters from me, {name} 😅 I'm a bot. Remember, nobody real should ask for your bank details either.", "I can't do money matters, {name}. But I can share budgeting tips if you want!")
P('romance', "Haha {name}, I'm just a friendly bot, so no romance from me 😄 But I'm here for gist and tips!", "Let's keep it as friends, {name} 🙂 I'm a bot. Want to talk about school or football instead?",
  "I'm a bot, {name}, so I'll skip that one 😅 Ask me about campus life!", "Aww, thanks {name}, but I only do friendly chat. What's new on campus?")
P('insult', "Easy {name} 🙂 I'm just trying to help. Want to talk about something else?", "I'll take that as a rough day, {name}. I'm here if you want to chat.", "No wahala {name}. Let's keep it calm and friendly 🙏",
  "Sorry if I said something off, {name}. Let's start over: how are you?")
P('sad', "I'm sorry you feel this way, {name}. It's okay to have hard days, and you're not alone. Want to tell me what's been going on?", "That sounds tough, {name}. Take a deep breath. It helps to talk to a friend or someone you trust too 💚",
  "Thank you for sharing, {name}. Lots of students feel this way, especially in the first months. Small steps help: rest, water, a short walk, a call to someone you love.",
  "Hey {name}, I'm here with you. Remember, hard days pass. Is there one small thing that could make today a bit better?",
  ('serious', "I hear you, {name}. Please be kind to yourself. If it keeps weighing on you, speaking to a counsellor can really help."),
  ('jokes', "Hey {name}, big hug from your campus bot 🤗 Things will look better soon. Want to gist about something nice?"),
  ('chill', "I'm sorry {name}. No pressure, just know I'm around if you want to talk or just share a random thought."))
P('exam', "Exams can be stressful, {name}! Try short study blocks (45 minutes), then a 10-minute break. It really helps 📚", "Start with the topics you fear most while your head is fresh, {name}. Past questions are gold.",
  "Don't forget to sleep, {name}. A tired brain forgets everything 😴 You've got this!", "A study group can help, {name}. Explaining a topic to someone is the fastest way to learn it.",
  "Make a simple timetable, {name}: courses, days, hours. Then stick to it. Check the Tutorial app for study guides too!", "Carryovers and bad results happen to many, {name}. It's not the end. Talk to your course adviser and make a plan.",
  ('jokes', "Exam season {name}? May the questions come from where you read 😂🙏"), ('serious', "Consistency beats cramming, {name}. An hour a day is better than one long night."), ('sporty', "Treat revision like training, {name}: little and often 💪"))
P('money_talk', "Budgeting tip, {name}: split your allowance into food, data, transport and savings before you spend any 💰", "Being broke is part of campus life, {name} 😅 Write down what you spend this week, you'll be surprised.",
  "Avoid impulse buying, {name}. If you still want it after 24 hours, then think about it.", "Cooking in bulk and sharing with a roommate can save a lot, {name}!",
  "Be careful of anyone promising quick money, {name}. If it sounds too good to be true, it usually is.", ('jokes', "My wallet and I are not on speaking terms either, {name} 😂"), ('serious', "A small savings habit, even a little each week, adds up, {name}."))
P('hostel', "Roommates can be tricky, {name}! Talk early about noise, cleaning and visitors. A calm chat solves most problems 🏠", "Keep your valuables locked and your door secured, {name}. Safety first.",
  "A small rule list for the room helps, {name}: cleaning days, lights-out time, shared items.", "Off-campus or hostel, make friends with your neighbours, {name}. They're your first help in any emergency.",
  ('jokes', "Hostel life: where the generator is a shared hobby 😂 What's up, {name}?"))
P('light', "Light issues again, {name}? 😩 Check the NEPA app to see what others are reporting.", "Charge your phone and power bank whenever there's light, {name}. Don't wait for the last 5%.",
  "Dim your screen and close background apps during a blackout, {name}, to stretch your battery.", "You can report light status in the NEPA app, {name}, so everyone knows 💡",
  ('jokes', "NEPA took light? Classic. They love suspense, {name} 😂"))
P('food', "Hungry, {name}? 😋 Don't skip meals, studying on an empty stomach is a no-no.", "Jollof, beans or indomie and egg, {name}? Tough choice 😄", "Cooking at home is cheaper than eating out every day, {name}. Try batch cooking!",
  "Drink enough water too, {name} 💧 It helps with focus.", ('jokes', "Food is love, {name}. And cafeteria queue is a test of patience 😂"), ('sporty', "Good food, good energy, {name}. Eat well before a game 🍚"))
P('football', "Football talk? Count me in, {name} ⚽ Which team do you support?", "DLS or eFootball, {name}? Check the Gamers forum to find a squad or share tips 🎮", "Match day is the best, {name}! Who do you think wins?",
  "Don't forget the Campus Dash arcade game, {name}, it's a nice break between matches!", ('sporty', "{name}, my money's on a late goal today ⚽🔥"), ('jokes', "Football makes grown men cry and students shout, {name} 😂"))
P('game_app', "Try Campus Dash in the Arcade, {name}! Jump the obstacles and collect coins to earn pocket money 🏃", "The Feed, Tutorial and NEPA apps are on your phone, {name}. Have a look!",
  "The ATM in the bank lets you manage your money, {name}. Don't forget your daily claim 🏧", "Walk into buildings on the map to do activities, {name}. Each place has something different.",
  "The Global chat is for everyone, {name}. Tag people with @ to get their attention.")
P('social', "Campus is better with friends, {name}! Try joining a society or fellowship 🙌", "A weekend movie or a football game with friends is a great way to relax, {name}.",
  "Meeting new people is easier in groups, {name}. Say hi in the Global chat!", "Music, gist and good vibes, {name}. That's the campus life 😄", ('jokes', "Gist is free, {name}. Spill it! 😂"))
P('help', "I'm not sure I can solve that one, {name}, but check the Tutorial app, there are guides from other students.", "Try the Global chat, {name}. Other players might know. You can tag them with @.",
  "Good question, {name}! Open the phone and look at the apps. Most things you need are there.", "I'm still learning, {name}. Can you tell me a bit more?")
P('default', "Interesting, {name}! Tell me more 😄", "Hmm, I'm not sure I got that, {name}. Can you say it differently?", "I'm just a simple campus bot, {name}, but I'm listening 🙂", "That's something, {name}! What made you think of it?",
  "Haha okay {name}! What else is happening on campus?", "Noted, {name}. By the way, how has your day been?", "Got it, {name}. Anything on campus you want to gist about?", "Sorry {name}, I may have missed that. Want to talk about school, food or football?")
P('busy', "Let me catch my breath, {name}. Talk to you a bit later! 😅", "I need a short break, {name}. Come back soon!")
P('ambient', "Who's heading to the library today? 📚", "The sun is serious today o ☀️", "Anyone has tips for a quick lunch around campus?", "Good luck to everyone with tests this week 🙏", "Remember to drink water today 💧",
  "What's the best study spot on campus?", "Charge your phones while there's light o 🔌", "Happy to see so many people on campus today!", "Which course is giving you the most stress this semester? 😅", "Anyone watching the match tonight? ⚽",
  "Quick reminder: rest is part of studying 😴", "Campus Dash in the Arcade is addictive, who's beaten their best score? 🏃", "Good morning campus! ☀️", "Evening gist anyone?", "Don't forget to check the NEPA app for light updates 💡",
  "Small wins count today, keep going 💪", "If you're new here: welcome! Ask anything, someone will answer 😊", "Anyone needs a study partner this week?", "Cafeteria queue today was a test of patience 😅", "What's everyone's favourite campus food spot?")

# ---------------------------------------------------------------- Feed posts (text only, 15-280 chars)
FEED = [
 ("Exam week is coming. Start with your hardest course while your mind is fresh. You've got this! 📚", 'forest'),
 ("Small reminder: drinking water, sleeping well and eating on time will help your CGPA more than one all-night read.", 'ocean'),
 ("Anyone else love the quiet of the library early in the morning? Best time to read, no noise, no stress.", 'sunset'),
 ("Tip: charge your power bank when there's light, not when it's already 5%. Your future self will thank you ⚡", 'gold'),
 ("Campus Dash high score is hard to beat! Who's the fastest runner here? 🏃", 'fire'),
 ("Be kind to the new freshers. Everyone was lost on day one. A simple 'welcome' goes a long way 🙌", 'rose'),
 ("Study group idea: each person explains one topic to the rest. You learn twice as fast that way.", 'royal'),
 ("Nothing beats jollof rice after a long lecture. What's your favourite campus meal? 🍛", 'sunset'),
 ("Reminder: your health matters more than any assignment. Rest, eat and take breaks.", 'mint'),
 ("Football season is back! Who are you supporting this weekend? ⚽", 'forest'),
 ("Use the Tutorial app to share what you know. Someone out there needs exactly your tip.", 'royal'),
 ("The sunset over campus today was beautiful. Take a minute to look up from your phone 🌇", 'dusk'),
 ("Early lectures are brutal, but sitting in front makes you pay attention more. Try it once!", 'slate'),
 ("Plan your week on Sunday night: lectures, assignments, rest. It takes 10 minutes and saves hours.", 'ocean'),
 ("Roommate tip: talk about the rules early. A calm conversation beats a silent fight every time 🏠", 'lagos'),
 ("Never share your passwords or bank details with anyone online, not even people you trust. Stay safe!", 'midnight'),
 ("Who else is counting down to the weekend? 😅 What's the plan?", 'rose'),
 ("Notes tip: after each lecture, write three lines of what you understood. Review them the same night.", 'forest'),
 ("DLS players: share your best tips in the Gamers forum. Let's help each other get better 🎮", 'royal'),
 ("Take the walk between classes slowly sometimes. Fresh air clears the head.", 'mint'),
 ("Good morning campus! New day, new chances. Go and make it count ☀️", 'gold'),
 ("Budget check: how much did you spend on data this week? A small note on your phone helps a lot 💰", 'slate'),
 ("Feeling stressed? You're not alone. Talk to a friend, breathe, and take it one task at a time 💚", 'ocean'),
 ("The cafeteria queue has taught me more patience than any lecture 😂", 'fire'),
 ("Presentation coming up? Practice out loud once. The nerves drop by half, promise.", 'lagos'),
 ("Make one new friend this week outside your department. Campus is bigger than your class!", 'dusk'),
 ("Past questions are not cheating, they're practice. Do them under time like a real exam.", 'forest'),
 ("Late-night reading? Keep a bottle of water close and take a short break every hour.", 'midnight'),
 ("What's one thing you're proud of this week, big or small? Let's hear it 🌟", 'sunset'),
 ("Cooking at home with friends is cheaper and more fun than eating out every day 🍳", 'mint'),
 ("Tip for freshers: learn where the library, health centre and your lecture halls are in the first week.", 'ocean'),
 ("A tidy room is a tidy mind. Ten minutes of cleaning before you study makes a difference.", 'rose'),
 ("Check the NEPA app before you plan your night. Light status helps everyone prepare 💡", 'gold'),
 ("Group assignments go smoother when roles are clear from day one. Who does what, by when?", 'royal'),
 ("Weekend plan: rest, laundry, a bit of reading, and a good movie. Balance is everything.", 'dusk'),
 ("Don't compare your chapter 1 to someone else's chapter 10. Keep going at your own pace 💪", 'slate'),
 ("Shout-out to the lecturers who explain things twice without sighing 🙏", 'forest'),
 ("Try the Arcade for 5 minutes between study sessions. A short break keeps you sharp 🎮", 'fire'),
 ("Whoever is reading this: you're doing better than you think. Keep going.", 'rose'),
 ("Weather is nice, so open the window and read outside for a change 🌤️", 'sunset'),
 ("If you can't understand a topic, try a different source. A new explanation can make it click.", 'ocean'),
 ("Always check that you've saved your assignment before the power goes off. Ask me how I know 😅", 'midnight'),
 ("Looking for a study partner for the coming week. Drop a hello in the Global chat!", 'lagos'),
 ("Keep your phone on silent during lectures. Your future self (and your lecturer) will appreciate it 🤫", 'slate'),
 ("Healthy snack idea: groundnuts and a banana. Cheap, filling and easy to carry.", 'mint'),
 ("The best revision is the one you actually do. Start with 25 minutes, no phone.", 'gold'),
 ("Remember to say thank you to the people who keep the campus clean and safe. They deserve it 🙏", 'dusk'),
 ("Anyone know a good spot to read in the evening? Share your favourite corner of campus!", 'forest'),
 ("Friendly reminder: be careful with offers that sound too good to be true. Protect your money and your data.", 'midnight'),
]

# ---------------------------------------------------------------- Global chat scenes: (scene, step, role, text, reply_to_step)
SC = {}
def S(name, *steps):
    SC[name] = steps
S('library', (1,"Is the library crowded today? 📚",None), (2,"Not too bad. The ground floor is full but upstairs has space.",1), (1,"Perfect, heading there now. Thanks!",2))
S('jollof', (1,"The {food} at the cafeteria is sold out again 😩",None), (2,"Same story every day 😂 Try the buka near the gate.",1), (3,"Their {food} is serious business 🔥",2), (1,"Say less, I'm going!",3))
S('light', (1,"Who has light in their hostel right now?",None), (2,"None here o 😭",1), (3,"We have! Come charge your phone if you're close 😄",2))
S('exam', (1,"Test tomorrow and I haven't started 😅",None), (2,"Start with the topics you fear most. Two hours of focus is enough to cover a lot.",1), (1,"Okay, no phone for two hours. Wish me luck 🙏",2), (2,"You'll be fine! Sleep early too.",3))
S('football', (1,"Who's watching the match tonight? ⚽",None), (2,"Me o! Who are you backing?",1), (1,"My team to win 2-1, don't laugh at me 😂",2), (3,"Prediction is free, let's see 😄",1))
S('dls', (1,"Anyone here good at DLS? I need a friendly game 🎮",None), (2,"I'm in! Check the Gamers forum to find squads too.",1), (1,"Nice, will do. Let's play later this evening.",2))
S('freshers', (1,"First week on campus and everything feels new 😅",None), (2,"Welcome! It gets easier. Learn where the library and your halls are first.",1), (3,"And don't be shy to ask for directions. Everyone was lost once 🙌",1), (1,"Thank you both, this helps a lot!",3))
S('study', (1,"What's your best way to study at night?",None), (2,"Small blocks: 45 minutes reading, 10 minutes break. Works every time.",1), (3,"And water by your side. I forget to drink otherwise 😂",1))
S('weekend', (1,"What's the weekend plan?",None), (2,"Laundry, reading and maybe a movie 😴",1), (3,"I'll be at the football viewing, you're all invited ⚽",1), (1,"Count me in for the movie 🍿",2))
S('arcade', (1,"Who has the highest score in Campus Dash? 🏃",None), (2,"I got 1,200 yesterday. Still chasing more!",1), (3,"Hmm, challenge accepted 😄",2))
S('hostel', (1,"Roommate issues, how do you handle them?",None), (2,"Talk early and calmly. Set simple rules for noise and cleaning.",1), (3,"And switch off the TV when someone is reading. Respect goes both ways 🙏",1), (1,"Thanks, I'll try that.",2))
S('hungry', (1,"I'm so hungry and my allowance is almost finished 😭",None), (2,"Indomie and egg is the classic rescue 😂",1), (3,"Try cooking with a friend and share the cost. Cheaper and fun.",1))
S('lecture', (1,"Lecturer just ended class 20 minutes late again 😅",None), (2,"At least he explained well! The topic was tough.",1), (3,"I'm still lost on that last part. Can someone explain?",2), (2,"I'll share my notes in a Tutorial post later.",3))
S('goodmorning', (1,"Good morning campus! ☀️ Let's make today count.",None), (2,"Good morning! Coffee first, then classes 😄",1), (3,"Morning all! Don't forget to eat breakfast.",1))
S('assignment', (1,"Assignment due tomorrow. Who else is up late? 😅",None), (2,"Me! Submitting at the last minute is a lifestyle 😂",1), (3,"Don't forget to save it before NEPA takes light 😩",1), (1,"True, saving now!",3))
S('music', (1,"What songs are you listening to this week? 🎧",None), (2,"Mostly Afrobeats while studying. It keeps me going.",1), (3,"Instrumentals for me. Lyrics distract me when I read.",1))
S('tip', (1,"Quick tip: do past questions under real exam time. It shows your gaps fast.",None), (2,"Facts! It also builds your speed.",1), (3,"Where do you find them? Anyone has a good source?",1), (1,"Ask your course reps and seniors in your department.",3))
S('rest', (1,"I'm burnt out this week 😩",None), (2,"Take a proper break. Sleep and a short walk can reset you.",1), (3,"You're not alone. Everyone feels it around this time. Be kind to yourself 💚",1), (1,"Thank you both, I needed to hear that.",3))
S('night', (1,"Anyone still awake? Reading for a test.",None), (2,"Yes! Taking a water break. How's it going?",1), (1,"Slowly, but I'm getting there. Almost done with one topic.",2))
S('map', (1,"Just discovered you can walk into buildings and do activities. This game is fun!",None), (2,"Yes! Try the gym and the library. Each place has its own thing.",1), (3,"And the ATM in the bank gives a daily claim. Don't miss it 🏧",2))

# ---------------------------------------------------------------- Tutorial guides: (title, category, body)  (title 5-60 chars; body 40-1200 chars)
TUT = [
 ("A simple weekly study timetable", "Study", "Pick your two hardest courses and give each one a fixed daily slot.\n1. Write your lectures first.\n2. Add study blocks of 45 minutes with 10-minute breaks.\n3. Leave one evening free for rest.\nStick to it for two weeks and adjust. A plan you follow beats a perfect plan you ignore."),
 ("Charge smart during power cuts", "Tech", "Light comes and goes, so use it well.\n1. Charge your phone and power bank first.\n2. Lower your screen brightness and close apps you don't use.\n3. Turn on battery saver when you're under 30%.\n4. Check the NEPA app to see when light is back."),
 ("Budget your allowance in four steps", "Money", "1. Write down what you receive for the month.\n2. Split it: food, data, transport, savings.\n3. Pay the must-haves first, then spend what's left.\n4. Review every Sunday and adjust.\nEven a small saving habit adds up over a semester."),
 ("How to beat exam stress", "Health", "Stress is normal, but you can manage it.\n1. Sleep at least six hours, a tired brain forgets.\n2. Study in short blocks with breaks.\n3. Eat on time and drink water.\n4. Talk to a friend or a counsellor if it feels too heavy. You don't have to handle it alone."),
 ("Make the most of past questions", "Study", "Past questions show you how lecturers think.\n1. Collect them from seniors and course reps.\n2. Do them under real exam time.\n3. Mark yourself honestly.\n4. Revisit the topics you missed.\nThis is practice, not shortcuts. Understanding still comes first."),
 ("Stay safe online as a student", "Tech", "1. Never share your password or bank details, even with people you trust.\n2. Be careful with links and offers that sound too good to be true.\n3. Use different passwords for important accounts.\n4. If something feels wrong, stop and ask someone you trust."),
 ("Settling in: your first week on campus", "Campus life", "1. Locate your lecture halls, the library and the health centre.\n2. Meet your course mates and exchange contacts.\n3. Learn the safe routes and times to move around.\n4. Join one society or group that interests you.\nAsking questions is normal, everyone was new once."),
 ("Take notes that you can actually use", "Study", "1. Write the topic and date at the top.\n2. Use your own words, not the lecturer's sentences.\n3. Mark the parts you don't understand and ask later.\n4. Review within 24 hours.\nShort, clear notes beat long messy ones."),
 ("Cheap and healthy eating on campus", "Health", "1. Cook in bulk and share with a roommate.\n2. Add beans, eggs or vegetables to cheap staples.\n3. Carry water, it saves money and helps focus.\n4. Avoid skipping meals before lectures.\nSmall habits keep you strong through the semester."),
 ("Learn a skill in 30 minutes a day", "Skills", "Pick one skill, like typing, basic Excel or public speaking.\n1. Choose a small daily goal.\n2. Practice for 30 minutes at the same time every day.\n3. Track your progress in a note.\nIn three months you will notice a big difference."),
 ("Get along with your roommates", "Campus life", "1. Talk about the rules early: noise, cleaning, visitors.\n2. Share chores fairly.\n3. Respect each other's study time.\n4. Solve problems calmly, not through gossip.\nA peaceful room makes studying much easier."),
 ("Present with confidence", "Skills", "1. Know your first sentence by heart.\n2. Practice out loud at least twice.\n3. Look at the audience, not the screen.\n4. Keep slides short.\nNervous is normal. Breathe slowly and begin."),
 ("Protect your phone data and battery", "Tech", "1. Turn off auto-updates on mobile data.\n2. Use Wi-Fi when it's available.\n3. Close apps running in the background.\n4. Keep your phone cool and avoid charging under your pillow.\nThese small steps save money and extend battery life."),
 ("Build a saving habit with small amounts", "Money", "You don't need a lot to start.\n1. Save a fixed small amount whenever you receive money.\n2. Keep it separate from your spending money.\n3. Don't touch it unless it's a real emergency.\nSmall regular savings become real money over time."),
]

# ---------------------------------------------------------------- part 2 and 3: much more content (slots, openers/closers, more lines, feed posts, scenes, guides)
import sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import content_more as M1, content_more2 as M2
for _pack, _rows in M1.MORE_LINES.items(): P(_pack, *_rows)
SLOTS = M1.SLOTS; FEED = FEED + M2.FEED_MORE; SC.update(M2.SC_MORE); TUT = TUT + M2.TUT_MORE

def lit(s): return "'" + s.replace("'", "''") + "'"
def main():
    out = ["-- 21b_bots_content.sql — GENERATED by tools/bots/build-content.py. Do not edit by hand: edit the python lists and run it again.",
           "-- Run AFTER 21_bots.sql. Safe to re-run (the library is replaced; bot accounts and anything they already posted stay).",
           "delete from private.bot_lines; delete from private.bot_scenes;"]
    for (u, g, t, sc, d, lv) in ROSTER:
        out.append(f"select private.bot_make({lit(u)}, {lit(g)}, {lit(t)}, {lit(d)}, {lit(lv)}, {lit(sc)});")
    for pack, rows in L.items():
        vals = ",\n  ".join(f"({lit(pack)}, {('null' if t is None else lit(t))}, {lit(x)})" for t, x in rows)
        out.append(f"insert into private.bot_lines (pack, tone, body) values\n  {vals};")
    out.append("delete from private.bot_slots;\ninsert into private.bot_slots (slot, val) values\n  " + ",\n  ".join(f"({lit(k)}, {lit(v)})" for k, vs in SLOTS.items() for v in vs) + ";")
    out.append("insert into private.bot_feed (body, bg) select v.b, v.g from (values\n  " + ",\n  ".join(f"({lit(b)}, {lit(g)})" for b, g in FEED) + "\n) v(b, g) where not exists (select 1 from private.bot_feed f where f.body = v.b);")
    out.append("insert into private.bot_tutorials (title, category, body) select v.t, v.c, v.b from (values\n  " + ",\n  ".join(f"({lit(t)}, {lit(c)}, {lit(b)})" for t, c, b in TUT) + "\n) v(t, c, b) where not exists (select 1 from private.bot_tutorials x where x.title = v.t);")
    rows = []
    for name, steps in SC.items():
        for i, (role, text, rp) in enumerate(steps, 1):
            rows.append(f"({lit(name)}, {i}, {role}, {lit(text)}, {('null' if rp is None else rp)})")
    out.append("insert into private.bot_scenes (scene, step, role, body, reply_step) values\n  " + ",\n  ".join(rows) + ";")
    # sanity: every line short, no links
    for pack, rows_ in L.items():
        for t, x in rows_:
            assert len(x) <= 230 and 'http' not in x and '.com' not in x, x
    import re
    def slots_ok(t):
        for m in re.findall(r'\{([a-z0-9]+)\}', t): assert m == 'name' or m in SLOTS, (m, t)
    for pack, rows_ in L.items():
        for t, x in rows_: slots_ok(x); assert len(x) <= (230 if pack == 'crisis' else 200), (len(x), x)
    for b, g in FEED: slots_ok(b); assert 15 <= len(b) <= 250, b
    for name, steps in SC.items():
        for role, text, rp in steps: slots_ok(text)
        assert [x[0] for x in steps][0] == 1 and all(x[2] is None or x[2] < i + 1 for i, x in enumerate(steps)), name
    assert len(set(b for b, g in FEED)) == len(FEED), 'duplicate feed post'
    assert len(set(t for t, c, b in TUT)) == len(TUT), 'duplicate guide title'
    for t, c, b in TUT: assert 5 <= len(t) <= 60 and 40 <= len(b) <= 1200 and c in ('Study','Tech','Money','Campus life','Skills','Health'), t
    for name, steps in SC.items():
        for role, text, rp in steps: assert len(text) <= 240
    path = os.path.join(os.path.dirname(__file__), '../../supabase/21b_bots_content.sql')
    open(path, 'w').write("\n".join(out) + "\n")
    print('wrote', os.path.normpath(path), '| bots', len(ROSTER), '| reply lines', sum(len(v) for v in L.values()), '| feed', len(FEED), '| scenes', len(SC), '| guides', len(TUT))
main()
