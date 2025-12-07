const router = require('express').Router(),
    Event = require('./event.model'),
    authMiddleware = require('../../middlewares/auth'),
    debug = require('debug')('atrax:server'),
    {Resend} = require('resend'),
    {RESEND_API_KEY, RESEND_EMAIL} = process.env;

const resend = new Resend(RESEND_API_KEY);

router.get('/', async (req, res) => {
    try {
        const {
            startDate,
            endDate,
            limit,
            page
        } = req.query;

        const filter = {};

        if (startDate || endDate) {
            filter.date = {};
            if (startDate) filter.date.$gte = new Date(startDate);
            if (endDate) filter.date.$lte = new Date(endDate);
        }

        const events = await Event.find(filter)
            .skip(parseInt(page, 10))
            .limit(parseInt(limit, 10))
            .populate('creator', 'fullName email');
        res.json(events);
    }
    catch (err) {
        console.error(err);
        res.status(500).send(err);
    }
})

router.get('/new', async (req, res) => {
    res.render('event', {
        title: 'New Event',
        action: '/events',
        method: 'POST',
        submitLabel: 'Create Event'
    })
})

router.get('/:id', async (req, res) => {
    try {
        const {id} = req.params;
        const event = await Event.findById(id).populate('creator', 'fullName email _id');
        if (!event) {
            res.status(404).send('No event with id ' + id);
        }
        event.attendeeCount = event.attendees.length;
        // if (event.creator._id.toString() === req.user.userId.toString()) {
            res.json(event);
        // }
        // else {
        //     res.render('event', {
        //
        //     })
        // }
    }
    catch (err) {
        console.error(err);
        res.status(500).send(err);
    }
})

router.post('/', authMiddleware, async (req, res) => {
    const {
        title,
        description,
        date,
        location,
        maxAttendees
    } = req.body;

    const event = await Event.create({
        title,
        description,
        date,
        location,
        maxAttendees,
        creator: req.user.userId
    })

    debug(event)

    res.json(event);
})

router.put('/:id', authMiddleware, async (req, res) => {
    const {id} = req.params,
        {
            title,
            description,
            date,
            location,
            maxAttendees
        } = req.body,
        {userId} = req.user;

    try {
        let event = await Event.findById(id);

        if (!event) {
            res.status(404).send('No event with id ' + id);
        }

        if (event.creator._id.toString() !== userId.toString()) {
            return res.status(403).send('You are not allowed to modify this event');
        }

        event.title = title;
        event.description = description;
        event.date = date;
        event.location = location;
        event.maxAttendees = maxAttendees;

        event = await event.save()

        await event.populate('attendees', 'email');

        const attendeeEmails = event.attendees.map(({email}) => email)

        if (attendeeEmails.length) await resend.emails.send({
            from: RESEND_EMAIL,
            to: attendeeEmails,
            subject: 'Event Updated',
            text: `Hello,
                
The event ${event.title} was updated.
                
Best wishes!`,
        })

        res.json(event);
    }
    catch (err) {
        console.error(err);
        res.status(500).send(err);
    }
})

router.delete('/:id', authMiddleware, async (req, res) => {
    const {id} = req.params;

    let event = await Event.findById(id);

    if (event.creator._id.toString() !== req.user.userId.toString()) {
        return res.status(403).send('You are not allowed to delete this event');
    }

    await event.populate('attendees', 'email');

    const attendeeEmails = event.attendees.map(({email}) => email)

    await Event.findByIdAndDelete(id);

    if (attendeeEmails.length) {
        await resend.emails.send({
            from: RESEND_EMAIL,
            to: attendeeEmails,
            subject: 'Event Cancelled',
            text: `Hello,
                
The event ${event.title} was cancelled.
                
Best wishes!`,
        })
    }

    res.status(204).send('Event deleted');
})

router.post('/:id/register', authMiddleware, async (req, res) => {
    const {id} = req.params;
    const {userId, email, fullName} = req.user;
    let event = await Event.findById(id)
        .populate('creator', 'email fullName')
        .select('maxAttendees attendees creator');
    if (event.attendees.length >= event.maxAttendees) {
        return res.status(400).send('Event is full');
    }
    const {attendees} = await Event.findByIdAndUpdate(id, {
        $addToSet: {attendees: userId}},
    {new: true}
    )
        .populate('attendees', 'fullName email')
        .select('attendees');

    await resend.emails.send({
        from: RESEND_EMAIL,
        to: email,
        subject: 'Event Registration',
        text: `Hello ${fullName},
                
We are writing to confirm that you registered for ${event.title} event.
                
Best regards!`,
    });

    await resend.emails.send({
        from: RESEND_EMAIL,
        to: event.creator.email,
        subject: 'Event Registration',
        text: `Hello ${event.creator.fullName},
                
We are writing to notify you that ${fullName} registered for ${event.title} event.
                
Best regards!`,
    });

    res.json(attendees);
})

router.delete('/:id/unregister', authMiddleware, async (req, res) => {
    const {id} = req.params;
    const {userId, email, fullName} = req.user;

    const {attendees, title} = await Event.findByIdAndUpdate(id, {
        $pull: {attendees: userId},
    }, {
        new: true
    })
        .populate('attendees')
        .select('fullName email');

    await resend.emails.send({
        from: RESEND_EMAIL,
        to: email,
        subject: 'Event Unregistration',
        text: `Hello ${fullName},
                
We are writing to confirm that you were unregistered from ${title} event.
                
Best regards!`,
    });

    res.json(attendees);
})
module.exports = router;